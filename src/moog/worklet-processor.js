

class WorkletProcessor extends AudioWorkletProcessor {


  constructor(options) {
    super();

    this.port.onmessage = (e) => {

        WebAssembly.instantiate(e.data)
        .then((result) => {
            this.exports = result.instance.exports;
            
            this.inputStart   = exports.inputBufferPtr();
            this.outputStart  = exports.outputBufferPtr();

            this.inputBuffer  = new Float32Array(exports.memory.buffer, this.inputStart, 128)
            this.outputBuffer = new Float32Array(exports.memory.buffer, this.outputStart, 128)

            this.exports.init();
        }); 
    };
  }
  
  process(inputList, outputList, parameters) {

    this.inputBuffer.set(inputList[0][0]);
    this.exports.filterProcess();
    outputList[0][0].set(this.outputBuffer);

    return true;
  }
}
registerProcessor('worklet-processor', WorkletProcessor);