struct VisibilityCounters {
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

@group(0) @binding(0) var<storage, read_write> counters: VisibilityCounters;
@group(0) @binding(1) var<storage, read_write> indirect: IndirectArguments;

@compute @workgroup_size(1)
fn finalizeIndirect() {
  indirect.indexCount = 36u;
  indirect.instanceCount = min(atomicLoad(&counters.visibleCount), counters.capacity);
  indirect.firstIndex = 0u;
  indirect.baseVertex = 0;
  indirect.firstInstance = 0u;
}
