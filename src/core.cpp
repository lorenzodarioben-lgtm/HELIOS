#include "helios/core.hpp"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <fstream>
#include <limits>
#include <numeric>
#include <stdexcept>

namespace helios {
namespace {
constexpr double pi=3.14159265358979323846;
double component(Vec3 v,int axis) { return axis==0?v.x:(axis==1?v.y:v.z); }
Vec3 minv(Vec3 a,Vec3 b) { return {std::min(a.x,b.x),std::min(a.y,b.y),std::min(a.z,b.z)}; }
Vec3 maxv(Vec3 a,Vec3 b) { return {std::max(a.x,b.x),std::max(a.y,b.y),std::max(a.z,b.z)}; }
Aabb unite(Aabb a,Aabb b) { return {minv(a.lo,b.lo),maxv(a.hi,b.hi)}; }
std::uint64_t mix64(std::uint64_t x) {
  x+=0x9e3779b97f4a7c15ULL;
  x=(x^(x>>30))*0xbf58476d1ce4e5b9ULL;
  x=(x^(x>>27))*0x94d049bb133111ebULL;
  return x^(x>>31);
}
struct Rng {
  std::uint64_t state;
  std::uint64_t next() { state+=0x9e3779b97f4a7c15ULL; return mix64(state); }
  double uniform() { return static_cast<double>(next()>>11)*(1.0/9007199254740992.0); }
};
Vec3 random_unit(Rng& rng) {
  const double z=2*rng.uniform()-1;
  const double phi=2*pi*rng.uniform();
  const double r=std::sqrt(std::max(0.0,1-z*z));
  return {r*std::cos(phi),r*std::sin(phi),z};
}
Vec3 reflect(Vec3 v,Vec3 n) { return v-n*(2*dot(v,n)); }
Vec3 refract(Vec3 uv,Vec3 n,double eta) {
  const double cos_theta=std::min(dot(-uv,n),1.0);
  const Vec3 perp=(uv+n*cos_theta)*eta;
  const Vec3 parallel=n*(-std::sqrt(std::abs(1.0-perp.length2())));
  return perp+parallel;
}
double schlick(double cos_theta,double eta) {
  double r=(1-eta)/(1+eta);r*=r;
  return r+(1-r)*std::pow(1-cos_theta,5);
}
Vec3 trace(const Scene& scene,const Ray& first,const RenderConfig& cfg,Rng& rng,Counters& stats) {
  Ray ray=first;
  Vec3 throughput{1,1,1};
  Vec3 radiance;
  bool last_specular=true;
  for(int depth=0;depth<cfg.max_depth;++depth) {
    ++stats.rays;
    Hit h;
    if(!scene.hit(ray,0.001,1e30,h,stats,cfg.bvh)) {
      const Vec3 d=unit(ray.direction);
      const double t=0.5*(d.y+1);
      radiance+=mul(throughput,(1-t)*Vec3{0.78,0.86,1.0}+t*Vec3{0.18,0.32,0.6});
      break;
    }
    const Material& m=scene.materials[static_cast<std::size_t>(h.material)];
    if(m.kind==MaterialKind::light) {
      if(last_specular) radiance+=mul(throughput,m.color);
      break;
    }
    if(m.kind==MaterialKind::diffuse&&!scene.light_triangles.empty()) {
      const std::size_t light_number=std::min(scene.light_triangles.size()-1,
        static_cast<std::size_t>(rng.uniform()*static_cast<double>(scene.light_triangles.size())));
      const Primitive& light=scene.primitives[static_cast<std::size_t>(scene.light_triangles[light_number])];
      const Vec3 edge1=light.b-light.a,edge2=light.c-light.a;
      const Vec3 area_vector=cross(edge1,edge2);
      const double area=0.5*area_vector.length();
      const double root=std::sqrt(rng.uniform()),v=rng.uniform();
      const Vec3 point=light.a*(1-root)+light.b*(root*(1-v))+light.c*(root*v);
      const Vec3 shadow_origin=h.p+h.normal*0.0001;
      const Vec3 to_light=point-shadow_origin;
      const double distance2=to_light.length2();
      const double distance=std::sqrt(distance2);
      const Vec3 direction=to_light/distance;
      const double surface_cos=std::max(0.0,dot(h.normal,direction));
      const double light_cos=area>0?std::max(0.0,dot(area_vector/area_vector.length(),-direction)):0.0;
      if(surface_cos>0&&light_cos>0&&area>0) {
        ++stats.rays;++stats.shadow_rays;
        Hit blocker;
        if(!scene.hit({shadow_origin,direction},0.0001,distance-0.0001,blocker,stats,cfg.bvh)) {
          const Vec3 emission=scene.materials[static_cast<std::size_t>(light.material)].color;
          const double factor=surface_cos*light_cos*area*static_cast<double>(scene.light_triangles.size())/(pi*distance2);
          radiance+=mul(mul(throughput,m.color),emission)*factor;
        }
      }
    }
    Vec3 direction;
    if(m.kind==MaterialKind::diffuse) {
      direction=h.normal+random_unit(rng);
      if(direction.length2()<1e-12) direction=h.normal;
    } else if(m.kind==MaterialKind::metal) {
      direction=reflect(unit(ray.direction),h.normal)+random_unit(rng)*m.parameter;
      if(dot(direction,h.normal)<=0) break;
    } else {
      const double eta=h.front?1.0/m.parameter:m.parameter;
      const Vec3 uv=unit(ray.direction);
      const double cosine=std::min(dot(-uv,h.normal),1.0);
      const double sine=std::sqrt(1-cosine*cosine);
      direction=(eta*sine>1.0 || schlick(cosine,eta)>rng.uniform())?reflect(uv,h.normal):refract(uv,h.normal,eta);
    }
    throughput=mul(throughput,m.color);
    last_specular=m.kind!=MaterialKind::diffuse;
    ray={h.p+h.normal*(dot(direction,h.normal)>=0?0.0001:-0.0001),direction};
  }
  return radiance;
}
std::uint8_t encode(double x) {
  x=std::max(0.0,x);
  const double mapped=std::sqrt(x/(1+x));
  return static_cast<std::uint8_t>(std::clamp(255.999*mapped,0.0,255.0));
}
void add_sphere(Scene& s,Vec3 center,double radius,int material) {
  s.primitives.push_back({Primitive::Kind::sphere,center,{},{},radius,material});
}
void add_triangle(Scene& s,Vec3 a,Vec3 b,Vec3 c,int material) {
  s.primitives.push_back({Primitive::Kind::triangle,a,b,c,0,material});
}
}
double Vec3::length() const { return std::sqrt(length2()); }
Vec3 operator*(double t,Vec3 v) { return v*t; }
Vec3 mul(Vec3 a,Vec3 b) { return {a.x*b.x,a.y*b.y,a.z*b.z}; }
double dot(Vec3 a,Vec3 b) { return a.x*b.x+a.y*b.y+a.z*b.z; }
Vec3 cross(Vec3 a,Vec3 b) { return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x}; }
Vec3 unit(Vec3 a) { return a/a.length(); }
Counters& Counters::operator+=(const Counters& b) {
  rays+=b.rays;shadow_rays+=b.shadow_rays;node_visits+=b.node_visits;primitive_tests+=b.primitive_tests;pixels+=b.pixels;tiles+=b.tiles;return *this;
}
bool Aabb::hit(const Ray& ray,double tmin,double tmax) const {
  for(int axis=0;axis<3;++axis) {
    const double d=component(ray.direction,axis);
    const double o=component(ray.origin,axis);
    if(std::abs(d)<1e-15) {
      if(o<component(lo,axis)||o>component(hi,axis)) return false;
      continue;
    }
    double a=(component(lo,axis)-o)/d;
    double b=(component(hi,axis)-o)/d;
    if(a>b) std::swap(a,b);
    tmin=std::max(tmin,a);tmax=std::min(tmax,b);
    if(tmax<tmin) return false;
  }
  return true;
}
Aabb Primitive::bounds() const {
  if(kind==Kind::sphere) { Vec3 r{radius,radius,radius};return {a-r,a+r}; }
  const Vec3 pad{1e-6,1e-6,1e-6};
  return {minv(minv(a,b),c)-pad,maxv(maxv(a,b),c)+pad};
}
bool intersect(const Primitive& p,const Ray& ray,double tmin,double tmax,Hit& h) {
  double t=0;
  Vec3 outward;
  if(p.kind==Primitive::Kind::sphere) {
    const Vec3 oc=ray.origin-p.a;
    const double aa=ray.direction.length2();
    const double half_b=dot(oc,ray.direction);
    const double cc=oc.length2()-p.radius*p.radius;
    const double discriminant=half_b*half_b-aa*cc;
    if(discriminant<0) return false;
    const double root=std::sqrt(discriminant);
    t=(-half_b-root)/aa;
    if(t<tmin||t>=tmax) { t=(-half_b+root)/aa;if(t<tmin||t>=tmax) return false; }
    outward=(ray.at(t)-p.a)/p.radius;
  } else {
    const Vec3 e1=p.b-p.a,e2=p.c-p.a;
    const Vec3 q=cross(ray.direction,e2);
    const double det=dot(e1,q);
    if(std::abs(det)<1e-12) return false;
    const double inv=1.0/det;
    const Vec3 s=ray.origin-p.a;
    const double u=dot(s,q)*inv;
    if(u<0||u>1) return false;
    const Vec3 r=cross(s,e1);
    const double v=dot(ray.direction,r)*inv;
    if(v<0||u+v>1) return false;
    t=dot(e2,r)*inv;
    if(t<tmin||t>=tmax) return false;
    outward=unit(cross(e1,e2));
  }
  h.t=t;h.p=ray.at(t);h.front=dot(ray.direction,outward)<0;
  h.normal=h.front?outward:-outward;h.material=p.material;
  return true;
}
int Scene::build_node(int begin,int end,int depth) {
  const int index=static_cast<int>(nodes_.size());
  depth_=std::max(depth_,depth);
  nodes_.push_back({});
  Aabb box=primitives[static_cast<std::size_t>(order_[static_cast<std::size_t>(begin)])].bounds();
  Vec3 cmin=(box.lo+box.hi)*0.5,cmax=cmin;
  for(int i=begin+1;i<end;++i) {
    const Aabb b=primitives[static_cast<std::size_t>(order_[static_cast<std::size_t>(i)])].bounds();
    box=unite(box,b);
    const Vec3 c=(b.lo+b.hi)*0.5;
    cmin=minv(cmin,c);cmax=maxv(cmax,c);
  }
  nodes_[static_cast<std::size_t>(index)].box=box;
  if(end-begin<=4) {
    nodes_[static_cast<std::size_t>(index)].start=begin;
    nodes_[static_cast<std::size_t>(index)].count=end-begin;
    return index;
  }
  const Vec3 span=cmax-cmin;
  const int axis=(span.x>=span.y&&span.x>=span.z)?0:(span.y>=span.z?1:2);
  const int mid=begin+(end-begin)/2;
  std::nth_element(order_.begin()+begin,order_.begin()+mid,order_.begin()+end,[&](int a,int b) {
    const Aabb aa=primitives[static_cast<std::size_t>(a)].bounds();
    const Aabb bb=primitives[static_cast<std::size_t>(b)].bounds();
    const double ca=component(aa.lo+aa.hi,axis),cb=component(bb.lo+bb.hi,axis);
    return ca==cb?a<b:ca<cb;
  });
  const int left=build_node(begin,mid,depth+1),right=build_node(mid,end,depth+1);
  nodes_[static_cast<std::size_t>(index)].left=left;
  nodes_[static_cast<std::size_t>(index)].right=right;
  return index;
}
void Scene::build_bvh() {
  nodes_.clear();order_.resize(primitives.size());depth_=0;
  light_triangles.clear();
  for(std::size_t i=0;i<primitives.size();++i)
    if(primitives[i].kind==Primitive::Kind::triangle&&materials[static_cast<std::size_t>(primitives[i].material)].kind==MaterialKind::light)
      light_triangles.push_back(static_cast<int>(i));
  std::iota(order_.begin(),order_.end(),0);
  if(!primitives.empty()) build_node(0,static_cast<int>(primitives.size()),0);
  // The count-median split keeps depth <= ceil(log2(n)), far below the fixed traversal stack.
  if(depth_+1>max_traversal_stack) throw std::length_error("BVH deeper than traversal stack");
}
bool Scene::hit(const Ray& ray,double tmin,double tmax,Hit& best,Counters& counters,bool use_bvh) const {
  bool found=false;
  if(!use_bvh||nodes_.empty()) {
    for(const Primitive& p:primitives) {
      ++counters.primitive_tests;
      Hit h;
      if(intersect(p,ray,tmin,tmax,h)) { best=h;tmax=h.t;found=true; }
    }
    return found;
  }
  // Fixed-size stack: allocating a std::vector per query dominated threaded runs.
  // Pushing both children of each visited node needs at most depth+1 slots.
  int stack[max_traversal_stack];
  int top=0;
  stack[top++]=0;
  while(top>0) {
    const int id=stack[--top];
    const BvhNode& node=nodes_[static_cast<std::size_t>(id)];
    ++counters.node_visits;
    if(!node.box.hit(ray,tmin,tmax)) continue;
    if(node.count>0) {
      for(int i=0;i<node.count;++i) {
        const Primitive& p=primitives[static_cast<std::size_t>(order_[static_cast<std::size_t>(node.start+i)])];
        ++counters.primitive_tests;
        Hit h;
        if(intersect(p,ray,tmin,tmax,h)) {best=h;tmax=h.t;found=true;}
      }
    } else { stack[top++]=node.right;stack[top++]=node.left; }
  }
  return found;
}
Scene make_scene(const std::string& name) {
  if(name!="showcase"&&name!="uniform"&&name!="reflective"&&name!="imbalanced"&&name!="bvh_stress"&&name!="scheduler_stress")
    throw std::invalid_argument("unknown scene: "+name);
  Scene s;
  s.materials={{MaterialKind::diffuse,{0.72,0.75,0.8},0},
               {MaterialKind::diffuse,{0.8,0.28,0.16},0},
               {MaterialKind::diffuse,{0.17,0.42,0.65},0},
               {MaterialKind::metal,{0.85,0.8,0.72},0.06},
               {MaterialKind::glass,{1,1,1},1.5},
               {MaterialKind::light,{6,4.5,3.2},0}};
  add_sphere(s,{0,-100.55,0},100,0);
  if(name=="uniform") {
    for(int z=0;z<5;++z) for(int x=0;x<9;++x)
      add_sphere(s,{(x-4)*0.7,-0.19,-z*0.75},0.36,(x+z)%3==0?2:1);
    s.camera_from={0,2,7};s.camera_at={0,-0.1,-1.4};
  } else {
    add_sphere(s,{-1.25,0.05,0},0.6,1);
    add_sphere(s,{0,0.05,-0.3},0.6,4);
    add_sphere(s,{1.25,0.05,-0.1},0.6,3);
    if(name=="showcase")
      add_triangle(s,{-0.85,1.0,-1.6},{0.85,1.0,-1.6},{0,1.55,-1.6},5);
    else
      add_triangle(s,{-1.7,1.55,-1.5},{1.7,1.55,-1.5},{0,2.2,-1.1},5);
    if(name=="reflective"||name=="imbalanced"||name=="scheduler_stress") {
      for(int i=0;i<12;++i) {
        const double a=2*pi*i/12;
        add_sphere(s,{2.8*std::cos(a),-0.2,2.8*std::sin(a)-0.2},0.34,i%2?3:4);
      }
    }
    if(name=="imbalanced"||name=="scheduler_stress") {
      const int side=name=="scheduler_stress"?26:14;
      const double spacing=name=="scheduler_stress"?0.115:0.21;
      for(int z=0;z<side;++z) for(int x=0;x<side;++x)
        add_sphere(s,{-4.1+x*spacing,-0.36,-3.6-z*spacing},spacing*0.5,(x+z)%3==0?3:2);
      s.camera_from={-1.8,1.8,7};s.camera_at={-1.2,0,-1.3};
    }
    if(name=="bvh_stress") {
      for(int z=0;z<30;++z) for(int x=0;x<30;++x)
        add_sphere(s,{(x-15)*0.26,-0.39,-1.5-z*0.26},0.12,(x+z)%3==0?1:2);
    }
  }
  s.build_bvh();return s;
}
Camera::Camera(const Scene& s,int width,int height) {
  origin=s.camera_from;
  const double aspect=static_cast<double>(width)/height;
  const double viewport_h=2*std::tan(s.fov*pi/360.0);
  const Vec3 w=unit(s.camera_from-s.camera_at);
  const Vec3 u=unit(cross({0,1,0},w));
  const Vec3 v=cross(w,u);
  horizontal=u*(aspect*viewport_h);vertical=v*viewport_h;
  lower=origin-horizontal*0.5-vertical*0.5-w;
}
std::vector<Tile> make_tiles(int width,int height,int size) {
  if(width<=0||height<=0||size<=0) throw std::invalid_argument("image and tile dimensions must be positive");
  std::vector<Tile> tiles;
  for(int y=0;y<height;y+=size) for(int x=0;x<width;x+=size)
    tiles.push_back({static_cast<int>(tiles.size()),x,y,std::min(width,x+size),std::min(height,y+size)});
  return tiles;
}
TileResult render_tile(const Scene& scene,const Camera& camera,const RenderConfig& cfg,const Tile& tile,int threads) {
  const auto started=std::chrono::steady_clock::now();
  const int w=tile.x1-tile.x0,h=tile.y1-tile.y0;
  TileResult out;
  out.rgb.resize(static_cast<std::size_t>(w*h*3));
#ifdef HELIOS_OPENMP
#pragma omp parallel num_threads(threads) if(threads>1)
#endif
  {
    // Each thread counts into its own stack object and merges once per tile. A shared
    // per-thread array put neighbours' hot counters on one cache line (false sharing).
    Counters stats;
#ifdef HELIOS_OPENMP
#pragma omp for schedule(static)
#endif
    for(int i=0;i<w*h;++i) {
      const int x=tile.x0+i%w,y=tile.y0+i/w;
      Vec3 sum;
      for(int sample=0;sample<cfg.spp;++sample) {
        const std::uint64_t pixel=static_cast<std::uint64_t>(y)*static_cast<std::uint64_t>(cfg.width)+static_cast<std::uint64_t>(x);
        Rng rng{mix64(cfg.seed^mix64(pixel)^mix64(static_cast<std::uint64_t>(sample)))};
        const double u=(x+rng.uniform())/cfg.width;
        const double v=1.0-(y+rng.uniform())/cfg.height;
        sum+=trace(scene,camera.ray(u,v),cfg,rng,stats);
      }
      sum=sum/static_cast<double>(cfg.spp);
      const std::size_t offset=static_cast<std::size_t>(i)*3;
      out.rgb[offset]=encode(sum.x);out.rgb[offset+1]=encode(sum.y);out.rgb[offset+2]=encode(sum.z);
      ++stats.pixels;
    }
#ifdef HELIOS_OPENMP
#pragma omp critical(helios_tile_counters)
#endif
    out.counters+=stats;
  }
  out.counters.tiles=1;
  out.seconds=std::chrono::duration<double>(std::chrono::steady_clock::now()-started).count();
  return out;
}
void place_tile(std::vector<std::uint8_t>& image,int width,const Tile& tile,const std::vector<std::uint8_t>& rgb) {
  const int w=tile.x1-tile.x0,h=tile.y1-tile.y0;
  if(rgb.size()!=static_cast<std::size_t>(w*h*3)) throw std::invalid_argument("tile payload size mismatch");
  for(int y=0;y<h;++y) {
    const auto from=rgb.begin()+static_cast<std::ptrdiff_t>(y*w*3);
    auto to=image.begin()+static_cast<std::ptrdiff_t>(((tile.y0+y)*width+tile.x0)*3);
    std::copy_n(from,w*3,to);
  }
}
void write_ppm(const std::string& path,int width,int height,const std::vector<std::uint8_t>& image) {
  std::ofstream out(path,std::ios::binary);
  if(!out) throw std::runtime_error("cannot open image output: "+path);
  out<<"P6\n"<<width<<' '<<height<<"\n255\n";
  out.write(reinterpret_cast<const char*>(image.data()),static_cast<std::streamsize>(image.size()));
  if(!out) throw std::runtime_error("cannot write image output: "+path);
}
std::uint64_t image_hash(const std::vector<std::uint8_t>& image) {
  std::uint64_t h=14695981039346656037ULL;
  for(std::uint8_t byte:image) {h^=byte;h*=1099511628211ULL;}
  return h;
}
}
