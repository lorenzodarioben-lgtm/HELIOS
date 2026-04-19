#include "helios/core.hpp"
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <vector>
#ifdef HELIOS_OPENMP
#include <omp.h>
#endif
using namespace helios;
void check(bool condition,const char* message) { if(!condition) throw std::runtime_error(message); }
std::vector<std::uint8_t> render(const Scene& scene,const RenderConfig& cfg,bool parallel) {
  const Camera camera(scene,cfg.width,cfg.height);
  const auto tiles=make_tiles(cfg.width,cfg.height,cfg.tile);
  std::vector<std::uint8_t> image(static_cast<std::size_t>(cfg.width*cfg.height*3));
#ifdef HELIOS_OPENMP
#pragma omp parallel for num_threads(4) if(parallel)
#endif
  for(int i=0;i<static_cast<int>(tiles.size());++i) {
    const TileResult result=render_tile(scene,camera,cfg,tiles[static_cast<std::size_t>(i)]);
    place_tile(image,cfg.width,tiles[static_cast<std::size_t>(i)],result.rgb);
  }
  return image;
}
int main() {
  try {
    check(std::abs(dot({1,2,3},{4,5,6})-32)<1e-12,"dot product");
    check(std::abs(cross({1,0,0},{0,1,0}).z-1)<1e-12,"cross product");
    Primitive sphere{Primitive::Kind::sphere,{0,0,0},{},{},1,0};
    Hit h;
    check(intersect(sphere,{{0,0,3},{0,0,-1}},0.001,100,h)&&std::abs(h.t-2)<1e-12,"sphere hit");
    Primitive triangle{Primitive::Kind::triangle,{-1,-1,0},{1,-1,0},{0,1,0},0,0};
    check(intersect(triangle,{{0,0,2},{0,0,-1}},0.001,100,h)&&std::abs(h.t-2)<1e-12,"triangle hit");
    check(!intersect(triangle,{{2,2,2},{0,0,-1}},0.001,100,h),"triangle miss");
    const Aabb box{{-1,-1,-1},{1,1,1}};
    check(box.hit({{0,0,3},{0,0,-1}},0,100),"AABB hit");
    check(!box.hit({{2,0,3},{0,0,-1}},0,100),"AABB parallel miss");
    const auto tiles=make_tiles(35,19,8);
    std::vector<int> coverage(35*19);
    for(const Tile& tile:tiles) for(int y=tile.y0;y<tile.y1;++y) for(int x=tile.x0;x<tile.x1;++x) ++coverage[static_cast<std::size_t>(y*35+x)];
    for(int n:coverage) check(n==1,"tile coverage");
    check(tiles.back().x1==35&&tiles.back().y1==19,"boundary tile");
    Scene scene=make_scene("bvh_stress");
    for(int y=0;y<11;++y) for(int x=0;x<17;++x) {
      const Ray ray{{0,1,5},{(x-8)*0.12,(y-5)*0.08,-1}};
      Hit brute,bvh;Counters cb,cv;
      const bool a=scene.hit(ray,0.001,100,brute,cb,false);
      const bool b=scene.hit(ray,0.001,100,bvh,cv,true);
      check(a==b,"BVH hit existence");
      if(a) check(std::abs(brute.t-bvh.t)<1e-9,"BVH nearest distance");
    }
    // Traversal uses a fixed stack of bvh_depth()+1 slots; the median split must keep depth logarithmic.
    for(const char* name:{"showcase","uniform","reflective","imbalanced","bvh_stress","scheduler_stress"})
      check(make_scene(name).bvh_depth()+1<=Scene::max_traversal_stack,"scene BVH fits traversal stack");
    Scene many;
    for(int i=0;i<4096;++i)
      many.primitives.push_back({Primitive::Kind::sphere,{(i%64)*0.3-9.6,(i/64)*0.3-9.6,-5.0},{},{},0.12,0});
    many.build_bvh();
    check(many.node_count()>1000&&many.bvh_depth()<=12,"logarithmic BVH depth");
    for(int k=0;k<256;++k) {
      const Ray ray{{0,0,5},{(k%16)*1.13-9.0,(k/16)*1.13-9.0,-10.0}};
      Hit brute,bvh;Counters cb,cv;
      const bool a=many.hit(ray,0.001,100,brute,cb,false);
      const bool b=many.hit(ray,0.001,100,bvh,cv,true);
      check(a==b&&(!a||std::abs(brute.t-bvh.t)<1e-9),"deep BVH matches brute force");
    }
    RenderConfig cfg;cfg.width=37;cfg.height=23;cfg.tile=8;cfg.spp=3;cfg.max_depth=5;
    const Scene small=make_scene("showcase");
    const auto first=render(small,cfg,false);
    check(first==render(small,cfg,false),"sequential reproducibility");
#ifdef HELIOS_OPENMP
    check(first==render(small,cfg,true),"OpenMP reproducibility");
    // Hybrid ranks thread inside a tile: pixels and per-thread counter totals must match one thread.
    const Camera camera(small,cfg.width,cfg.height);
    for(const Tile& tile:make_tiles(cfg.width,cfg.height,cfg.tile)) {
      const TileResult one=render_tile(small,camera,cfg,tile,1);
      const Counters& a=one.counters;
      check(a.rays>0&&a.pixels==static_cast<std::uint64_t>((tile.x1-tile.x0)*(tile.y1-tile.y0)),"single-thread tile counters");
      for(int threads:{2,3,4}) {
        const TileResult many=render_tile(small,camera,cfg,tile,threads);
        const Counters& b=many.counters;
        check(many.rgb==one.rgb,"intra-tile threaded pixels");
        check(a.rays==b.rays&&a.shadow_rays==b.shadow_rays&&a.node_visits==b.node_visits&&
              a.primitive_tests==b.primitive_tests&&a.pixels==b.pixels&&a.tiles==b.tiles,"intra-tile threaded counter totals");
      }
    }
#endif
    cfg.bvh=false;
    const auto without_bvh=render(small,cfg,false);
    check(first==without_bvh,"BVH image equality");
    std::cout<<"All Helios core checks passed\n";
    return 0;
  } catch(const std::exception& e) {
    std::cerr<<"Test failure: "<<e.what()<<'\n';
    return 1;
  }
}
