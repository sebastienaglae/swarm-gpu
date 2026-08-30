import { FrameSampleRecorder } from '../../src/diagnostics/FrameSampleRecorder';

describe('FrameSampleRecorder', () => {
  it('records without allocating until a snapshot and preserves ring order', () => {
    const recorder = new FrameSampleRecorder(3);
    recorder.record(1);
    recorder.record(2);
    recorder.record(3);
    recorder.record(4);
    expect(recorder.snapshot()).toEqual([2, 3, 4]);
  });

  it('ignores invalid samples and resets logical contents', () => {
    const recorder = new FrameSampleRecorder(2);
    recorder.record(Number.NaN);
    recorder.record(-1);
    recorder.record(2);
    expect(recorder.snapshot()).toEqual([2]);
    recorder.reset();
    expect(recorder.snapshot()).toEqual([]);
  });

  it('rejects invalid capacity', () => {
    expect(() => new FrameSampleRecorder(0)).toThrow(RangeError);
  });
});
