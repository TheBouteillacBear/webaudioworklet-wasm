

class WASMWorkletProcessor extends AudioWorkletProcessor {

  constructor() {

    super();

    this.port.onmessage = (e) => {
        const key = Object.keys(e.data)[0];
        const value = e.data[key];
        switch ( key ) {
            case "webassembly": 

                WebAssembly.instantiate(value, this.importObject)
                .then((instance) => {
                    const exports = instance.instance.exports;

                    this.filter       = exports.filter;
                    this.setCutoff    = exports.setCutoff;
                    this.setResonance = exports.setResonance;

                    this.inputStart   = exports.inputBufferPtr();
                    this.inputBuffer  = new Float32Array(exports.memory.buffer, this.inputStart, 128)
                    this.outputStart  = exports.outputBufferPtr();
                    this.outputBuffer = new Float32Array(exports.memory.buffer, this.outputStart, 128)

                    exports.init();
                }); 
                break;       
            case "cutOff":
                this.setCutoff(value);
                break;
            case "resonance": 
                this.setResonance(value);
                break;
        }
    };
  }
  
  process(inputList, outputList, parameters) {

    this.inputBuffer.set(inputList[0][0]);
    this.filter();
    outputList[0][0].set(this.outputBuffer);

    return true;
  }
}
registerProcessor('wasm-worklet-processor', WASMWorkletProcessor);