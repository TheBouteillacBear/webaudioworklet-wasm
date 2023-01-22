# <span style="color: #FF8000"> A Moog ladder filter audioWorkletNode implementation with Webassembly
 
# Preamble
Webassembly is an approach of choice when speed  is required in web page script processing. The audioWorklet inner loop requiries speed for a fast processing of the continuous sample batches flowing through webAudio AudioNode chain.

The aim of this project is to implement a C version of the well known Moog low pass Ladder filter as a webAudio audioWorkletNode. Such a digital filter is CPU intensive so a wasm module is a great candidate. Interface between javascript and the native inner function will be as thin as possible.

<img src="/assets/images/Screenshot.png" width="40%" height="40%">
> screenshot
 
### implemetation :
* /src/minimal : barebone osc + nop filter + speaker
* /src/ladder  : moog ladder audioWorktetNode osc + lader filter + speaker
* /src/demo    : add resonance & offset tunable parameters through sliders + oscilloscope for visualization
Thanks to [ddiakopoulos/MoogLadders](https://github.com/ddiakopoulos/MoogLadders) for it great study of existing moog filters.
The microtracker works well for me.

# Architecture
<img src="/assets/images/globalFlow.png" width="50%" height="50%">

# Compile C to wasm Bytecode
Compiles C source file to wasm module. No needs for emscripten js glue to keep things as small and simple as posible.
```script
emcc -O3 -s WASM=1 filterKernel.c -o filterKernel.wasm --no-entry
```

* WASM=1 : will output a Webassedmbly module
* --no-entry : no main function to export.

> actualy the full wasm byteCode is 1123 bytes including the Moog Lader filter code !

#### filterKernel.c
```Cpp
#include <emscripten.h>
...
float inputBuffer[128];
float outputBuffer[128];
...
EMSCRIPTEN_KEEPALIVE
    float* inputBufferPtr() {
        return inputBuffer;
    }
EMSCRIPTEN_KEEPALIVE
    float* outputBufferPtr() {
        return outputBuffer;
    }
EMSCRIPTEN_KEEPALIVE
    void filter() {
        for (int i=0 ; i<128 ; i++) {
            ...
            outputBuffer[i] = out;
        }
    }
```
* the EMSCRIPTEN_KEEPALIVE macro "Tells the compiler and linker to preserve a symbol, and export it" [[emscripten]](https://emscripten.org/docs/getting_started/index.html)
* <span style="color:green;">float inputBuffer[128]</span> & <span style="color:green;">float outputBuffer[128]</span> creates two ***local memory*** float buffers.
* <span style="color:blue;">inputBufferPtr()</span> & <span style="color:blue;">outputBufferPtr(</span>) are two exported functions returning pointers to the allocated local memory.

# Creates audioWorkletNode and sends wasm to its linked AudioWorkletProcessor

### The javascript which creates the Web Audio graph
1. Creates AudioWorkletNode
2. Reads wasm byteCode as a byteArray
3. Sends the byteCode to the newly created AudioWorkletProcessor

#### index.html script
```js
//  Creates a AudioWorkletNode and its associated AudioWorkletProcessor
    await audioCtx.audioWorklet.addModule('worklet-processor.js')
    filterWorkletNode = new AudioWorkletNode(audioCtx, 'worklet-processor')
//  Gets WeAssembly byteCode from file
    const response = await fetch('filterKernel.wasm')
    const byteCode = await response.arrayBuffer()
//  Sends bytecode to the AudioWorkletProcessor for instanciation
    filterWorkletNode.port.postMessage(byteCode)
```
# The AudioWorkletProcessor
1. instantiate the received byteCode, resulting in a module and the first instance of that module.
2. get pointers to instance memory.
3. create a javascript shadow buffer pointing to the corresponding instance buffer.
4. create then innerloop samples process native code function 

#### worklet-processor.js
```js
this.port.onmessage = (e) => {
    //  Instanciate 
    WebAssembly.instantiate(e.data) // 1.
    .then((result) => {
        /*  result : {module: Module, instance: Instance} */
        //  exposes C functions to the outside world. only for readness
        const exports = result.instance.exports;
        //  Gets pointer to wasm module memory
        this.inputStart   = exports.inputBufferPtr(); //2.
        this.outputStart  = exports.outputBufferPtr();
        //  Create shadow typed buffer of float.
        this.inputBuffer  = new Float32Array(exports.memory.buffer, //3.
                                                this.inputStart,
                                                this.WABEAUDIO_FRAME_SIZE);
        this.outputBuffer = new Float32Array(exports.memory.buffer,
                                                this.outputStart,
                                                this.WABEAUDIO_FRAME_SIZE);
        //  Gets the filter function
        this.filter = exports.filter; //4.
    });
```
#### <span style="color:green;">const exports</span> debug view
```
- filter: ƒ $filter()                       -> filter function
- inputBufferPtr: ƒ $inputBufferPtr()       -> return buffer ptr function
- memory: Memory(256)                       -> Wasm memory : 256 page
    *buffer: ArrayBuffer(16777216)          -> WebAssembly pages are 1024
    *[[Prototype]]: WebAssembly.Memory
- outputBufferPtr: ƒ $outputBufferPtr()     -> return buffer ptr function
- ...
```
<img src="/assets/images/memory.png" width="70%" height="70%">
# Finally the process loop
 
1. copy webAudio samples buffer to local memory
2. process samples (ie. audio filter)
3. returns processed samples to WebAudio next Node

```js
    ...
    process(inputList, outputList, parameters) {   

        this.inputBuffer.set(inputList[0][0]);   // 1.
        this.filter();                           // 2.  
        outputList[0][0].set(this.outputBuffer); // 3.
        return true;
    }
    ...
    registerProcessor('worklet-processor', WorkletProcessor);
```
# Passing parameters
Filters needs to be parameterized. Hereafter two transmitting chains between main javascript and inner samples processor loop.
## 1- Calling a C function exported to javascript.
1. UI sends message to WASMWorkletProcessor
#### index.html
```html
    document.getElementById('cutOff').addEventListener('input', (evt) => {
        ladderNode.port.postMessage({cutOff: evt.target.value})
        });
```
2. WASMWorkletProcessor calls an wasm exported function
#### worklet-processor.js
```js
    ...
    // a 'shortcut' to the exported C function
    this.setCutoff = exports.setCutoff;
    ...
    this.port.onmessage = (e) => {
        ...
        // calls the C function to set the value
        this.setCutoff(value);
        ...
    }
```
3.  Wasm filter process set local variable
#### filter
```cpp
float cutoff;
EMSCRIPTEN_KEEPALIVE
    void setCutoff(float c){
        cutoff = c * 2 * _PI / _SAMPLERATE;
        cutoff = (cutoff > 1) ? 1 : cutoff;
    }
```
![Architecture](/assets/images/parameter.png)
 
## 2- Using the <em>AudioWorkletNode.parameters</em> interface.

 1. Declare a parmeter in the audioWorkletProcessor <em>static get parameterDescriptors()</em> function
 ```js
 static get parameterDescriptors() {
        return [
            {
            name: "Q",
            defaultValue: 1.0,
            minValue: 0.02,
            maxValue: 2.0,
            automationRate: "k-rate",
            },
        ];
    }
 ```
 2. Instanciate the parameter in the UI
 ```js
 QParam = ladderNode.parameters.get("Q");
 ```
3. Use the created parameter in the UI as a regular WebAudio parameter.
 ```js
 document.getElementById('resonance').addEventListener('input', (evt) => {
        QParam.value = parseFloat(evt.target.value)/20.0;
        });
 ```
