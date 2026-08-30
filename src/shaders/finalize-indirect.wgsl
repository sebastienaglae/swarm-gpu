struct LodCounter {
  visibleCount: atomic<u32>,
  overflowCount: atomic<u32>,
  capacity: u32,
  padding: u32,
};

struct IndirectArguments {
  indexCount: u32,
  instanceCount: u32,
  firstIndex: u32,
  baseVertex: i32,
  firstInstance: u32,
};

@group(0) @binding(0) var<storage, read_write> counters: array<LodCounter, 3>;
@group(0) @binding(1) var<storage, read_write> indirect: array<IndirectArguments, 3>;

const INDEX_COUNTS = array<u32, 3>(36u, 18u, 6u);
const FIRST_INDICES = array<u32, 3>(0u, 36u, 54u);
const BASE_VERTICES = array<i32, 3>(0, 8, 13);

@compute @workgroup_size(3)
fn finalizeIndirect(@builtin(local_invocation_index) lod: u32) {
  indirect[lod].indexCount = INDEX_COUNTS[lod];
  indirect[lod].instanceCount = min(atomicLoad(&counters[lod].visibleCount), counters[lod].capacity);
  indirect[lod].firstIndex = FIRST_INDICES[lod];
  indirect[lod].baseVertex = BASE_VERTICES[lod];
  indirect[lod].firstInstance = 0u;
}
