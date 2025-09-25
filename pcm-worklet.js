// 20ms @48k em Float32 → posta p/ main thread
class PCMWorklet extends AudioWorkletProcessor {
    constructor(opts){
      super();
      this.label = opts?.processorOptions?.label || 'unknown';
      this.buf = [];
      this.samplesPerPacket = 48000 * 0.02; // 960 amostras (20ms)
    }
    process(inputs){
      const input = inputs[0];
      if (!input || input.length === 0) return true;
      const ch0 = input[0];
      if (!ch0) return true;
  
      this.buf.push(Float32Array.from(ch0));
      let total = this.buf.reduce((n,a)=>n+a.length, 0);
  
      while (total >= this.samplesPerPacket){
        let need = this.samplesPerPacket, out = new Float32Array(need), off = 0;
        while (need > 0){
          let chunk = this.buf[0];
          if (chunk.length <= need){
            out.set(chunk, off);
            off += chunk.length; need -= chunk.length; this.buf.shift();
          } else {
            out.set(chunk.subarray(0, need), off);
            this.buf[0] = chunk.subarray(need);
            need = 0;
          }
        }
        this.port.postMessage({ label: this.label, samples: out, sampleRate: 48000 }, [out.buffer]);
        total -= this.samplesPerPacket;
      }
      return true;
    }
  }
  registerProcessor('pcm-worklet', PCMWorklet);
  