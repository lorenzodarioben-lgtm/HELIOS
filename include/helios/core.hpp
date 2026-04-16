#pragma once
#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace helios {
struct Vec3 {
  double x=0, y=0, z=0;
  Vec3()=default;
  Vec3(double a,double b,double c):x(a),y(b),z(c){}
  Vec3 operator+(Vec3 b) const { return {x+b.x,y+b.y,z+b.z}; }
  Vec3 operator-(Vec3 b) const { return {x-b.x,y-b.y,z-b.z}; }
  Vec3 operator-() const { return {-x,-y,-z}; }
  Vec3 operator*(double t) const { return {x*t,y*t,z*t}; }
  Vec3 operator/(double t) const { return *this*(1.0/t); }
  Vec3& operator+=(Vec3 b) { x+=b.x;y+=b.y;z+=b.z;return *this; }
  double length2() const { return x*x+y*y+z*z; }
  double length() const;
};
Vec3 operator*(double t,Vec3 v);
Vec3 mul(Vec3 a,Vec3 b);
double dot(Vec3 a,Vec3 b);
Vec3 cross(Vec3 a,Vec3 b);
Vec3 unit(Vec3 a);
struct Ray { Vec3 origin, direction; Vec3 at(double t) const { return origin+direction*t; } };
struct Aabb { Vec3 lo,hi; bool hit(const Ray&,double tmin,double tmax) const; };
enum class MaterialKind { diffuse,metal,glass,light };
struct Material { MaterialKind kind; Vec3 color; double parameter=0; };
struct Primitive {
  enum class Kind { sphere,triangle } kind;
  Vec3 a,b,c;
  double radius=0;
  int material=0;
  Aabb bounds() const;
};
struct Hit { double t=0; Vec3 p,normal; int material=-1; bool front=true; };
struct Counters {
  std::uint64_t rays=0, shadow_rays=0, node_visits=0, primitive_tests=0, pixels=0, tiles=0;
  Counters& operator+=(const Counters& b);
};
bool intersect(const Primitive&,const Ray&,double,double,Hit&);
struct BvhNode { Aabb box; int left=-1,right=-1,start=0,count=0; };
class Scene {
public:
  std::vector<Material> materials;
  std::vector<Primitive> primitives;
  std::vector<int> light_triangles;
  Vec3 camera_from{0,1,5}, camera_at{0,0,0};
  double fov=40;
  void build_bvh();
  bool hit(const Ray&,double,double,Hit&,Counters&,bool use_bvh) const;
  std::size_t node_count() const { return nodes_.size(); }
  int bvh_depth() const { return depth_; }
  static constexpr int max_traversal_stack=64;  // hit() needs bvh_depth()+1 slots; checked in build_bvh
private:
  std::vector<int> order_;
  std::vector<BvhNode> nodes_;
  int depth_=0;
  int build_node(int begin,int end,int depth);
};
Scene make_scene(const std::string& name);
struct Camera {
  Vec3 origin,lower,horizontal,vertical;
  Camera(const Scene&,int width,int height);
  Ray ray(double u,double v) const { return {origin,lower+horizontal*u+vertical*v-origin}; }
};
struct Tile { int id,x0,y0,x1,y1; };
std::vector<Tile> make_tiles(int width,int height,int size);
struct RenderConfig { int width=320,height=180,spp=16,max_depth=8,tile=16,threads=1; std::uint64_t seed=42; bool bvh=true; };
struct TileResult { std::vector<std::uint8_t> rgb; Counters counters; double seconds=0,stall_seconds=0; };
TileResult render_tile(const Scene&,const Camera&,const RenderConfig&,const Tile&,int threads=1);
void place_tile(std::vector<std::uint8_t>& image,int width,const Tile&,const std::vector<std::uint8_t>& rgb);
void write_ppm(const std::string&,int width,int height,const std::vector<std::uint8_t>&);
std::uint64_t image_hash(const std::vector<std::uint8_t>&);
}
