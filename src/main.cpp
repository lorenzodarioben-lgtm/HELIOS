#include "helios/core.hpp"
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
#ifdef HELIOS_OPENMP
#include <omp.h>
#endif
#ifdef HELIOS_MPI
#include <mpi.h>
#endif

namespace {
using namespace helios;
struct Options {
  RenderConfig cfg;
  std::string backend="sequential",scene="showcase",schedule="static";
  std::string output="render.ppm",stats_json,trace_csv,tile_stats_csv;
  int slow_rank=-1,slow_us=0,slow_factor_milli=1000;
  int fixed_batch=1,adaptive_initial_batch=2,adaptive_target_ms=50;
  bool coordinator_only=false;
};
struct WorkerMetrics { Counters counters; double compute=0,stall=0; int assignments=0; };
struct TraceRecord { int worker=0,begin=0,count=0,remaining_on_completion=0; double assigned=0,completed=0,compute=0,stall=0,estimated_pixels_per_second=0; };
struct TileMetrics { int worker=0; double seconds=0,stall=0; Counters counters; };
struct RankTiming { double assignment_wait=0,result_wait=0,mpi_send=0,mpi_receive=0; int worker_requests=0; };
struct SchedulerMetrics {
  int assignments=0,completed_tiles=0,min_batch=0,max_batch=0;
  std::vector<int> batch_histogram=std::vector<int>(33,0);
  std::vector<double> final_worker_completion_seconds;
  double first_batch_completion_seconds=0,tail90_start_seconds=0,coordinator_handling_seconds=0;
};
struct Outcome { std::vector<std::uint8_t> image; std::vector<WorkerMetrics> workers; std::vector<TraceRecord> trace; std::vector<TileMetrics> tiles; std::vector<RankTiming> rank_timing; SchedulerMetrics scheduler; double wall=0; };
void help() {
  std::cout<<"Helios 0.1.0 - adaptive hybrid distributed path tracer\n"
           <<"Usage: helios render [options]\n"
           <<"  --backend sequential|openmp|mpi-static|mpi-dynamic|hybrid-static|hybrid-dynamic|hybrid-adaptive\n"
           <<"  --scene showcase|uniform|reflective|imbalanced|bvh_stress|scheduler_stress\n"
           <<"  --width N --height N --spp N --max-depth N --seed N --tile N\n"
           <<"  --threads N --omp-schedule static|dynamic|guided --no-bvh\n"
           <<"  --slow-rank N --slow-us N  (legacy sleep experiment)\n"
           <<"  --slow-rank N --slow-factor-milli N  (1001..4000, CPU busy delay)\n"
           <<"  --coordinator-only  (static MPI: rank 0 only gathers)\n"
           <<"  --fixed-batch N (dynamic, 1..32) --adaptive-initial-batch N (1..8) --adaptive-target-ms N (1..200)\n"
           <<"  --output FILE --stats-json FILE --trace-csv FILE --tile-stats-csv FILE\n";
}
int positive(const std::string& text,const std::string& flag) {
  std::size_t used=0;
  const long value=std::stol(text,&used);
  if(used!=text.size()||value<=0||value>1000000) throw std::invalid_argument("invalid "+flag+": "+text);
  return static_cast<int>(value);
}
Options parse(int argc,char** argv) {
  Options o;
  if(argc<2||std::string(argv[1])!="render") throw std::invalid_argument("expected 'render'; use --help");
  for(int i=2;i<argc;++i) {
    const std::string key=argv[i];
    if(key=="--no-bvh") {o.cfg.bvh=false;continue;}
    if(key=="--coordinator-only") {o.coordinator_only=true;continue;}
    if(i+1>=argc) throw std::invalid_argument("missing value for "+key);
    const std::string value=argv[++i];
    if(key=="--backend") o.backend=value;
    else if(key=="--scene") o.scene=value;
    else if(key=="--width") o.cfg.width=positive(value,key);
    else if(key=="--height") o.cfg.height=positive(value,key);
    else if(key=="--spp") o.cfg.spp=positive(value,key);
    else if(key=="--max-depth") o.cfg.max_depth=positive(value,key);
    else if(key=="--tile") o.cfg.tile=positive(value,key);
    else if(key=="--threads") {o.cfg.threads=positive(value,key);if(o.cfg.threads>256) throw std::invalid_argument("threads exceeds safety limit 256");}
    else if(key=="--slow-rank") o.slow_rank=positive(value,key);
    else if(key=="--slow-us") {o.slow_us=positive(value,key);if(o.slow_us>100000) throw std::invalid_argument("slow-us exceeds safety limit 100000");}
    else if(key=="--slow-factor-milli") {o.slow_factor_milli=positive(value,key);if(o.slow_factor_milli<1001||o.slow_factor_milli>4000) throw std::invalid_argument("slow-factor-milli must be 1001..4000");}
    else if(key=="--fixed-batch") {o.fixed_batch=positive(value,key);if(o.fixed_batch>32) throw std::invalid_argument("fixed-batch exceeds 32");}
    else if(key=="--adaptive-initial-batch") {o.adaptive_initial_batch=positive(value,key);if(o.adaptive_initial_batch>8) throw std::invalid_argument("adaptive-initial-batch exceeds 8");}
    else if(key=="--adaptive-target-ms") {o.adaptive_target_ms=positive(value,key);if(o.adaptive_target_ms>200) throw std::invalid_argument("adaptive-target-ms exceeds 200");}
    else if(key=="--seed") {if(value.empty()||value[0]=='-') throw std::invalid_argument("invalid seed");std::size_t n=0;o.cfg.seed=std::stoull(value,&n);if(n!=value.size()) throw std::invalid_argument("invalid seed");}
    else if(key=="--omp-schedule") o.schedule=value;
    else if(key=="--output") o.output=value;
    else if(key=="--stats-json") o.stats_json=value;
    else if(key=="--trace-csv") o.trace_csv=value;
    else if(key=="--tile-stats-csv") o.tile_stats_csv=value;
    else throw std::invalid_argument("unknown option: "+key);
  }
  const std::vector<std::string> backends={"sequential","openmp","mpi-static","mpi-dynamic","hybrid-static","hybrid-dynamic","hybrid-adaptive"};
  if(std::find(backends.begin(),backends.end(),o.backend)==backends.end()) throw std::invalid_argument("unknown backend: "+o.backend);
  if(o.schedule!="static"&&o.schedule!="dynamic"&&o.schedule!="guided") throw std::invalid_argument("unknown OpenMP schedule");
  const std::uint64_t pixel_count=static_cast<std::uint64_t>(o.cfg.width)*static_cast<std::uint64_t>(o.cfg.height);
  if(pixel_count>100000000ULL) throw std::invalid_argument("image exceeds 100 million pixel safety limit");
  if(o.output.empty()) throw std::invalid_argument("output path is empty");
  return o;
}
bool is_mpi(const std::string& backend) { return backend.rfind("mpi-",0)==0||backend.rfind("hybrid-",0)==0; }
bool is_hybrid(const std::string& backend) { return backend.rfind("hybrid-",0)==0; }
#ifdef HELIOS_MPI
bool is_static(const std::string& backend) { return backend=="mpi-static"||backend=="hybrid-static"; }
bool is_adaptive(const std::string& backend) { return backend=="hybrid-adaptive"; }
#endif
void accumulate(WorkerMetrics& worker,const TileResult& result) {
  worker.counters+=result.counters;worker.compute+=result.seconds-result.stall_seconds;worker.stall+=result.stall_seconds;++worker.assignments;
}
Outcome run_local(const Scene& scene,const Camera& camera,const Options& o,const std::vector<Tile>& tiles) {
  Outcome out;
  out.image.resize(static_cast<std::size_t>(o.cfg.width)*static_cast<std::size_t>(o.cfg.height)*3);
  out.tiles.resize(tiles.size());
  const int workers=o.backend=="openmp"?o.cfg.threads:1;
  out.workers.resize(static_cast<std::size_t>(workers));
  const auto started=std::chrono::steady_clock::now();
  if(o.backend=="sequential") {
    for(const Tile& tile:tiles) {
      const TileResult result=render_tile(scene,camera,o.cfg,tile);
      place_tile(out.image,o.cfg.width,tile,result.rgb);
      accumulate(out.workers[0],result);
      out.tiles[static_cast<std::size_t>(tile.id)]={0,result.seconds,result.stall_seconds,result.counters};
    }
  } else {
#ifdef HELIOS_OPENMP
    const omp_sched_t schedule=o.schedule=="dynamic"?omp_sched_dynamic:(o.schedule=="guided"?omp_sched_guided:omp_sched_static);
    omp_set_schedule(schedule,o.schedule=="static"?0:1);
#pragma omp parallel for schedule(runtime) num_threads(workers)
    for(int i=0;i<static_cast<int>(tiles.size());++i) {
      const Tile& tile=tiles[static_cast<std::size_t>(i)];
      const TileResult result=render_tile(scene,camera,o.cfg,tile);
      place_tile(out.image,o.cfg.width,tile,result.rgb);
      const int worker=omp_get_thread_num();
      accumulate(out.workers[static_cast<std::size_t>(worker)],result);
      out.tiles[static_cast<std::size_t>(tile.id)]={worker,result.seconds,result.stall_seconds,result.counters};
    }
#else
    throw std::runtime_error("OpenMP support was not compiled");
#endif
  }
  out.wall=std::chrono::duration<double>(std::chrono::steady_clock::now()-started).count();
  return out;
}
#ifdef HELIOS_MPI
enum Tags { assignment=20, batch_result=21, tile_header=22, tile_pixels=23 };
struct Packet { int id; Counters counters; double seconds,stall_seconds; };
struct Work {int begin;int count;};
double seconds_since(std::chrono::steady_clock::time_point start) {
  return std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count();
}
void send_result(const Tile& tile,const TileResult& result,int destination,RankTiming& timing) {
  Packet packet{tile.id,result.counters,result.seconds,result.stall_seconds};
  const auto started=std::chrono::steady_clock::now();
  MPI_Send(&packet,static_cast<int>(sizeof(packet)),MPI_BYTE,destination,tile_header,MPI_COMM_WORLD);
  MPI_Send(result.rgb.data(),static_cast<int>(result.rgb.size()),MPI_BYTE,destination,tile_pixels,MPI_COMM_WORLD);
  timing.mpi_send+=seconds_since(started);
}
TileResult receive_result(const std::vector<Tile>& tiles,int source,Packet& packet,RankTiming& timing) {
  const auto started=std::chrono::steady_clock::now();
  MPI_Recv(&packet,static_cast<int>(sizeof(packet)),MPI_BYTE,source,tile_header,MPI_COMM_WORLD,MPI_STATUS_IGNORE);
  if(packet.id<0||packet.id>=static_cast<int>(tiles.size())) throw std::runtime_error("invalid tile id from MPI worker");
  const Tile& tile=tiles[static_cast<std::size_t>(packet.id)];
  TileResult result;
  result.counters=packet.counters;result.seconds=packet.seconds;result.stall_seconds=packet.stall_seconds;
  result.rgb.resize(static_cast<std::size_t>((tile.x1-tile.x0)*(tile.y1-tile.y0)*3));
  MPI_Recv(result.rgb.data(),static_cast<int>(result.rgb.size()),MPI_BYTE,source,tile_pixels,MPI_COMM_WORLD,MPI_STATUS_IGNORE);
  timing.mpi_receive+=seconds_since(started);
  return result;
}
int batch_size(const Options& o,int remaining,int ranks,double throughput,double tile_pixels) {
  if(remaining<=0) return 0;
  if(!is_adaptive(o.backend)) return std::min(remaining,o.fixed_batch);
  // Measured pixels/second targets roughly 50 ms per assignment; taper near queue exhaustion.
  const int observed=throughput>0?static_cast<int>(std::clamp(throughput*static_cast<double>(o.adaptive_target_ms)/1000.0/tile_pixels,1.0,8.0)):o.adaptive_initial_batch;
  const int fair=std::max(1,remaining/std::max(1,(ranks-1)*2));
  return std::min({remaining,observed,fair,8});
}
Outcome run_mpi(const Scene& scene,const Camera& camera,const Options& o,const std::vector<Tile>& tiles,int rank,int ranks) {
  Outcome out;
  RankTiming local_timing;
  if(rank==0) {
    out.image.resize(static_cast<std::size_t>(o.cfg.width)*static_cast<std::size_t>(o.cfg.height)*3);
    out.workers.resize(static_cast<std::size_t>(ranks));
    out.tiles.resize(tiles.size());
    out.rank_timing.resize(static_cast<std::size_t>(ranks));
    out.scheduler.final_worker_completion_seconds.resize(static_cast<std::size_t>(ranks));
  }
  MPI_Barrier(MPI_COMM_WORLD);
  const auto started=std::chrono::steady_clock::now();
  auto render_assigned=[&](const Tile& tile) {
    TileResult result=render_tile(scene,camera,o.cfg,tile,is_hybrid(o.backend)?o.cfg.threads:1);
    if(rank==o.slow_rank && o.slow_us>0) {
      const auto stalled=std::chrono::steady_clock::now();
      std::this_thread::sleep_for(std::chrono::microseconds(o.slow_us));
      result.stall_seconds=seconds_since(stalled);
      result.seconds+=result.stall_seconds;
    } else if(rank==o.slow_rank && o.slow_factor_milli>1000) {
      // Match a multiple of this tile's measured render duration using active CPU work.
      // This is a synthetic capacity perturbation, not additional path tracing.
      const double target=result.seconds*static_cast<double>(o.slow_factor_milli-1000)/1000.0;
      const auto stalled=std::chrono::steady_clock::now();
      while(seconds_since(stalled)<target) { }
      result.stall_seconds=seconds_since(stalled);
      result.seconds+=result.stall_seconds;
    }
    return result;
  };
  const auto elapsed=[&] {return std::chrono::duration<double>(std::chrono::steady_clock::now()-started).count();};
  if(is_static(o.backend)||ranks==1) {
    std::vector<int> ids;
    const int worker_index=o.coordinator_only?rank-1:rank;
    const int worker_count=o.coordinator_only?ranks-1:ranks;
    const int begin=worker_index<0?0:static_cast<int>(static_cast<std::int64_t>(tiles.size())*worker_index/worker_count);
    const int end=worker_index<0?0:static_cast<int>(static_cast<std::int64_t>(tiles.size())*(worker_index+1)/worker_count);
    for(int i=begin;i<end;++i) ids.push_back(i);
    if(rank==0) {
      for(int id:ids) {
        const Tile& tile=tiles[static_cast<std::size_t>(id)];
        TileResult result=render_assigned(tile);
        place_tile(out.image,o.cfg.width,tile,result.rgb);accumulate(out.workers[0],result);
        out.tiles[static_cast<std::size_t>(tile.id)]={0,result.seconds,result.stall_seconds,result.counters};
      }
      for(int src=1;src<ranks;++src) {
        int count=0;
        const auto waited=std::chrono::steady_clock::now();
        MPI_Recv(&count,1,MPI_INT,src,batch_result,MPI_COMM_WORLD,MPI_STATUS_IGNORE);
        local_timing.result_wait+=seconds_since(waited);
        for(int k=0;k<count;++k) {
          Packet packet;
          TileResult result=receive_result(tiles,src,packet,local_timing);
          place_tile(out.image,o.cfg.width,tiles[static_cast<std::size_t>(packet.id)],result.rgb);
          accumulate(out.workers[static_cast<std::size_t>(src)],result);
          out.tiles[static_cast<std::size_t>(packet.id)]={src,result.seconds,result.stall_seconds,result.counters};
        }
      }
    } else {
      const int count=static_cast<int>(ids.size());
      const auto sent=std::chrono::steady_clock::now();
      MPI_Send(&count,1,MPI_INT,0,batch_result,MPI_COMM_WORLD);
      local_timing.mpi_send+=seconds_since(sent);
      for(int id:ids) {
        const Tile& tile=tiles[static_cast<std::size_t>(id)];
        const TileResult result=render_assigned(tile);
        send_result(tile,result,0,local_timing);
      }
    }
  } else if(rank==0) {
    int next=0,active=0;
    std::vector<double> throughput(static_cast<std::size_t>(ranks));
    std::vector<std::size_t> pending(static_cast<std::size_t>(ranks));
    auto dispatch=[&](int worker) {
      const int remaining=static_cast<int>(tiles.size())-next;
      Work work{next,batch_size(o,remaining,ranks,throughput[static_cast<std::size_t>(worker)],static_cast<double>(o.cfg.tile)*o.cfg.tile)};
      next+=work.count;
      if(work.count>0) {
        ++out.scheduler.assignments;
        ++out.scheduler.batch_histogram[static_cast<std::size_t>(work.count)];
        out.scheduler.min_batch=out.scheduler.min_batch?std::min(out.scheduler.min_batch,work.count):work.count;
        out.scheduler.max_batch=std::max(out.scheduler.max_batch,work.count);
        if(!o.trace_csv.empty()) {
          pending[static_cast<std::size_t>(worker)]=out.trace.size();
          out.trace.push_back({worker,work.begin,work.count,0,elapsed(),0,0,0,throughput[static_cast<std::size_t>(worker)]});
        }
      }
      const auto sent=std::chrono::steady_clock::now();
      MPI_Send(&work,2,MPI_INT,worker,assignment,MPI_COMM_WORLD);
      local_timing.mpi_send+=seconds_since(sent);
      if(work.count>0) ++active;
    };
    for(int worker=1;worker<ranks;++worker) dispatch(worker);
    while(active>0) {
      int count=0;MPI_Status status;
      const auto waited=std::chrono::steady_clock::now();
      MPI_Recv(&count,1,MPI_INT,MPI_ANY_SOURCE,batch_result,MPI_COMM_WORLD,&status);
      local_timing.result_wait+=seconds_since(waited);
      const auto handling_started=std::chrono::steady_clock::now();
      const int worker=status.MPI_SOURCE;
      double work_seconds=0,stall_seconds=0;std::uint64_t pixels=0;
      for(int k=0;k<count;++k) {
        Packet packet;
        TileResult result=receive_result(tiles,worker,packet,local_timing);
        place_tile(out.image,o.cfg.width,tiles[static_cast<std::size_t>(packet.id)],result.rgb);
        out.tiles[static_cast<std::size_t>(packet.id)]={worker,result.seconds,result.stall_seconds,result.counters};
        WorkerMetrics& metrics=out.workers[static_cast<std::size_t>(worker)];
        metrics.counters+=result.counters;
        metrics.compute+=result.seconds-result.stall_seconds;
        metrics.stall+=result.stall_seconds;
        work_seconds+=result.seconds;stall_seconds+=result.stall_seconds;pixels+=result.counters.pixels;
      }
      ++out.workers[static_cast<std::size_t>(worker)].assignments;
      const double completed_at=elapsed();
      out.scheduler.completed_tiles+=count;
      out.scheduler.final_worker_completion_seconds[static_cast<std::size_t>(worker)]=completed_at;
      if(out.scheduler.first_batch_completion_seconds==0) out.scheduler.first_batch_completion_seconds=completed_at;
      if(out.scheduler.tail90_start_seconds==0 && out.scheduler.completed_tiles*10>=static_cast<int>(tiles.size())*9)
        out.scheduler.tail90_start_seconds=completed_at;
      if(!o.trace_csv.empty()) {
        TraceRecord& record=out.trace[pending[static_cast<std::size_t>(worker)]];
        record.completed=completed_at;record.compute=work_seconds-stall_seconds;record.stall=stall_seconds;
        record.remaining_on_completion=static_cast<int>(tiles.size())-out.scheduler.completed_tiles;
      }
      if(work_seconds>0) {
        const double rate=static_cast<double>(pixels)/work_seconds;
        double& estimate=throughput[static_cast<std::size_t>(worker)];
        estimate=estimate==0?rate:0.5*estimate+0.5*rate;
      }
      --active;dispatch(worker);
      out.scheduler.coordinator_handling_seconds+=seconds_since(handling_started);
    }
  } else {
    while(true) {
      Work work{};
      const auto waited=std::chrono::steady_clock::now();
      MPI_Recv(&work,2,MPI_INT,0,assignment,MPI_COMM_WORLD,MPI_STATUS_IGNORE);
      local_timing.assignment_wait+=seconds_since(waited);
      ++local_timing.worker_requests;
      if(work.count==0) break;
      std::vector<TileResult> results;
      results.reserve(static_cast<std::size_t>(work.count));
      for(int i=0;i<work.count;++i)
        results.push_back(render_assigned(tiles[static_cast<std::size_t>(work.begin+i)]));
      const auto sent=std::chrono::steady_clock::now();
      MPI_Send(&work.count,1,MPI_INT,0,batch_result,MPI_COMM_WORLD);
      local_timing.mpi_send+=seconds_since(sent);
      for(int i=0;i<work.count;++i) send_result(tiles[static_cast<std::size_t>(work.begin+i)],results[static_cast<std::size_t>(i)],0,local_timing);
    }
  }
  MPI_Gather(&local_timing,static_cast<int>(sizeof(local_timing)),MPI_BYTE,
             rank==0?out.rank_timing.data():nullptr,static_cast<int>(sizeof(local_timing)),MPI_BYTE,
             0,MPI_COMM_WORLD);
  if(rank==0) out.wall=std::chrono::duration<double>(std::chrono::steady_clock::now()-started).count();
  return out;
}
#endif
void write_stats(const std::string& path,const Options& o,const Scene& scene,const Outcome& outcome,int ranks) {
  if(path.empty()) return;
  std::ofstream file(path);
  if(!file) throw std::runtime_error("cannot open stats JSON: "+path);
  Counters total;
  for(const WorkerMetrics& worker:outcome.workers) total+=worker.counters;
  file<<std::setprecision(9)<<"{\n  \"schema_version\": 1,\n  \"project\": \"Helios\",\n"
      <<"  \"backend\": \""<<o.backend<<"\",\n  \"scene\": \""<<o.scene<<"\",\n"
      <<"  \"width\": "<<o.cfg.width<<", \"height\": "<<o.cfg.height
      <<", \"spp\": "<<o.cfg.spp<<", \"max_depth\": "<<o.cfg.max_depth
      <<", \"seed\": "<<o.cfg.seed<<", \"tile\": "<<o.cfg.tile
      <<", \"bvh\": "<<(o.cfg.bvh?"true":"false")<<", \"bvh_nodes\": "<<scene.node_count()
      <<", \"ranks\": "<<ranks<<", \"threads_per_rank\": "<<o.cfg.threads
      <<", \"slow_rank\": "<<o.slow_rank<<", \"slow_us_per_tile\": "<<o.slow_us
      <<", \"slow_factor_milli\": "<<o.slow_factor_milli
      <<", \"fixed_batch\": "<<o.fixed_batch<<", \"adaptive_initial_batch\": "<<o.adaptive_initial_batch
      <<", \"adaptive_target_ms\": "<<o.adaptive_target_ms
      <<", \"coordinator_only\": "<<(o.coordinator_only?"true":"false")
      <<", \"omp_schedule\": \""<<o.schedule<<"\",\n"
      <<"  \"render_wall_seconds\": "<<outcome.wall
      <<", \"rays\": "<<total.rays<<", \"shadow_rays\": "<<total.shadow_rays<<", \"node_visits\": "<<total.node_visits
      <<", \"primitive_tests\": "<<total.primitive_tests<<", \"pixels\": "<<total.pixels
      <<", \"tiles\": "<<total.tiles<<",\n  \"image_hash_fnv1a64\": \""
      <<std::hex<<image_hash(outcome.image)<<std::dec<<"\",\n  \"workers\": [\n";
  for(std::size_t i=0;i<outcome.workers.size();++i) {
    const WorkerMetrics& w=outcome.workers[i];
    const RankTiming timing=i<outcome.rank_timing.size()?outcome.rank_timing[i]:RankTiming{};
    file<<"    {\"id\": "<<i<<", \"assignments\": "<<w.assignments
        <<", \"compute_seconds\": "<<w.compute<<", \"stall_seconds\": "<<w.stall
        <<", \"assigned_work_seconds\": "<<(w.compute+w.stall)<<", \"tiles\": "<<w.counters.tiles
        <<", \"pixels\": "<<w.counters.pixels<<", \"rays\": "<<w.counters.rays
        <<", \"assignment_wait_seconds\": "<<timing.assignment_wait
        <<", \"worker_requests\": "<<timing.worker_requests
        <<", \"result_wait_seconds\": "<<timing.result_wait
        <<", \"mpi_send_seconds\": "<<timing.mpi_send
        <<", \"mpi_receive_seconds\": "<<timing.mpi_receive
        <<", \"effective_pixels_per_second\": "<<((w.compute+w.stall)>0?static_cast<double>(w.counters.pixels)/(w.compute+w.stall):0.0)<<"}";
    if(i+1<outcome.workers.size()) file<<',';
    file<<'\n';
  }
  std::vector<int> batch_sizes;
  for(std::size_t i=1;i<outcome.scheduler.batch_histogram.size();++i)
    for(int j=0;j<outcome.scheduler.batch_histogram[i];++j) batch_sizes.push_back(static_cast<int>(i));
  const double median_batch=batch_sizes.empty()?0.0:(static_cast<double>(batch_sizes[(batch_sizes.size()-1)/2])+batch_sizes[batch_sizes.size()/2])/2.0;
  double first_final=0,last_final=0;
  for(double completion:outcome.scheduler.final_worker_completion_seconds) if(completion>0) {
    first_final=first_final==0?completion:std::min(first_final,completion);
    last_final=std::max(last_final,completion);
  }
  file<<"  ],\n  \"scheduler\": {\"trace_mode\": "<<(!o.trace_csv.empty()?"true":"false")
      <<", \"assignments_dispatched\": "<<outcome.scheduler.assignments
      <<", \"completed_microtiles\": "<<outcome.scheduler.completed_tiles
      <<", \"average_batch_size\": "<<(outcome.scheduler.assignments?static_cast<double>(outcome.scheduler.completed_tiles)/outcome.scheduler.assignments:0.0)
      <<", \"median_batch_size\": "<<median_batch
      <<", \"min_batch_size\": "<<outcome.scheduler.min_batch<<", \"max_batch_size\": "<<outcome.scheduler.max_batch
      <<", \"coordinator_handling_seconds\": "<<outcome.scheduler.coordinator_handling_seconds
      <<", \"first_batch_completion_seconds\": "<<outcome.scheduler.first_batch_completion_seconds
      <<", \"tail90_start_seconds\": "<<outcome.scheduler.tail90_start_seconds
      <<", \"tail90_seconds\": "<<(outcome.scheduler.tail90_start_seconds>0?std::max(0.0,outcome.wall-outcome.scheduler.tail90_start_seconds):0.0)
      <<", \"first_final_worker_completion_seconds\": "<<first_final
      <<", \"last_final_worker_completion_seconds\": "<<last_final
      <<", \"last_worker_spread_seconds\": "<<(last_final-first_final)
      <<", \"final_worker_completion_seconds\": [";
  for(std::size_t i=0;i<outcome.scheduler.final_worker_completion_seconds.size();++i) {
    if(i) file<<", ";
    file<<outcome.scheduler.final_worker_completion_seconds[i];
  }
  file<<"], \"batch_histogram\": [";
  for(std::size_t i=0;i<outcome.scheduler.batch_histogram.size();++i) {
    if(i) file<<", ";
    file<<outcome.scheduler.batch_histogram[i];
  }
  file<<"]}\n}\n";
  if(!file) throw std::runtime_error("cannot write stats JSON: "+path);
}
void write_trace(const std::string& path,const Outcome& outcome) {
  if(path.empty()) return;
  std::ofstream file(path);
  if(!file) throw std::runtime_error("cannot open trace CSV: "+path);
  file<<"worker,first_tile,tile_count,assigned_seconds,completed_seconds,worker_render_seconds,worker_stall_seconds,remaining_on_completion,estimated_pixels_per_second_at_dispatch\n";
  file<<std::setprecision(9);
  for(const TraceRecord& row:outcome.trace)
    file<<row.worker<<','<<row.begin<<','<<row.count<<','<<row.assigned<<','<<row.completed<<','<<row.compute<<','<<row.stall<<','<<row.remaining_on_completion<<','<<row.estimated_pixels_per_second<<'\n';
  if(!file) throw std::runtime_error("cannot write trace CSV: "+path);
}
void write_tile_stats(const std::string& path,const Outcome& outcome,const std::vector<Tile>& tiles) {
  if(path.empty()) return;
  std::ofstream file(path);
  if(!file) throw std::runtime_error("cannot open tile stats CSV: "+path);
  file<<"tile_id,x0,y0,x1,y1,worker,compute_seconds,stall_seconds,rays,node_visits,primitive_tests\n";
  file<<std::setprecision(9);
  for(const Tile& tile:tiles) {
    const TileMetrics& m=outcome.tiles[static_cast<std::size_t>(tile.id)];
    file<<tile.id<<','<<tile.x0<<','<<tile.y0<<','<<tile.x1<<','<<tile.y1<<','<<m.worker<<','
        <<(m.seconds-m.stall)<<','<<m.stall<<','<<m.counters.rays<<','<<m.counters.node_visits<<','<<m.counters.primitive_tests<<'\n';
  }
  if(!file) throw std::runtime_error("cannot write tile stats CSV: "+path);
}
}
int main(int argc,char** argv) {
  int rank=0,ranks=1;
#ifdef HELIOS_MPI
  MPI_Init(&argc,&argv);
  MPI_Comm_rank(MPI_COMM_WORLD,&rank);
  MPI_Comm_size(MPI_COMM_WORLD,&ranks);
#endif
  try {
    if(argc==1||std::string(argv[1])=="--help"||std::string(argv[1])=="-h") {
      if(rank==0) help();
#ifdef HELIOS_MPI
      MPI_Finalize();
#endif
      return 0;
    }
    Options o=parse(argc,argv);
#ifndef HELIOS_MPI
    if(is_mpi(o.backend)) throw std::runtime_error("MPI backend was not compiled");
#endif
#ifndef HELIOS_OPENMP
    if(o.backend=="openmp"||is_hybrid(o.backend)) throw std::runtime_error("OpenMP backend was not compiled");
#endif
    if(!is_mpi(o.backend)&&ranks!=1) throw std::runtime_error("non-MPI backend requires one rank");
#ifdef HELIOS_MPI
    if(is_mpi(o.backend)&&!is_static(o.backend)&&ranks<2) throw std::invalid_argument("dynamic MPI requires at least two ranks");
#endif
    if(o.backend!="openmp"&&!is_hybrid(o.backend)&&o.cfg.threads!=1) throw std::invalid_argument("this backend requires --threads 1");
    if(o.slow_us>0&&o.slow_factor_milli>1000) throw std::invalid_argument("choose either slow-us or slow-factor-milli");
    if((o.slow_rank!=-1)!=(o.slow_us>0||o.slow_factor_milli>1000)) throw std::invalid_argument("slow-rank requires a slowdown setting, and vice versa");
    if(o.slow_rank!=-1&&(!is_mpi(o.backend)||o.slow_rank>=ranks)) throw std::invalid_argument("slow-rank must name a nonzero MPI worker rank");
    if(o.coordinator_only&&(!is_mpi(o.backend)||o.backend.find("static")==std::string::npos||ranks<2)) throw std::invalid_argument("coordinator-only requires static MPI with at least two ranks");
    if(!o.trace_csv.empty()&&o.backend!="mpi-dynamic"&&o.backend!="hybrid-dynamic"&&o.backend!="hybrid-adaptive")
      throw std::invalid_argument("assignment trace requires a dynamic MPI backend");
    std::vector<std::filesystem::path> paths;
    for(const std::string& name:{o.output,o.stats_json,o.trace_csv,o.tile_stats_csv}) {
      if(name.empty()) continue;
      const auto path=std::filesystem::absolute(name).lexically_normal();
      if(!std::filesystem::exists(path.parent_path())) throw std::invalid_argument("output directory does not exist: "+path.parent_path().string());
      if(std::find(paths.begin(),paths.end(),path)!=paths.end()) throw std::invalid_argument("output paths must be distinct");
      paths.push_back(path);
    }
    const Scene scene=make_scene(o.scene);
    const Camera camera(scene,o.cfg.width,o.cfg.height);
    const std::vector<Tile> tiles=make_tiles(o.cfg.width,o.cfg.height,o.cfg.tile);
    Outcome result;
#ifdef HELIOS_MPI
    if(is_mpi(o.backend)) result=run_mpi(scene,camera,o,tiles,rank,ranks);
    else
#endif
      result=run_local(scene,camera,o,tiles);
    if(rank==0) {
      write_ppm(o.output,o.cfg.width,o.cfg.height,result.image);
      write_stats(o.stats_json,o,scene,result,ranks);
      write_trace(o.trace_csv,result);
      write_tile_stats(o.tile_stats_csv,result,tiles);
      std::cout<<std::fixed<<std::setprecision(4)<<"Rendered "<<o.cfg.width<<'x'<<o.cfg.height
               <<" scene="<<o.scene<<" backend="<<o.backend<<" ranks="<<ranks
               <<" threads="<<o.cfg.threads<<" time="<<result.wall<<" s hash="
               <<std::hex<<image_hash(result.image)<<std::dec<<" output="<<o.output<<'\n';
    }
#ifdef HELIOS_MPI
    MPI_Finalize();
#endif
    return 0;
  } catch(const std::exception& e) {
    std::cerr<<"Helios error (rank "<<rank<<"): "<<e.what()<<'\n';
#ifdef HELIOS_MPI
    MPI_Abort(MPI_COMM_WORLD,2);
#endif
    return 2;
  }
}
