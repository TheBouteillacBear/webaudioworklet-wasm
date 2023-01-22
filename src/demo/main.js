var audioCtx;
var oscillator, ladderNode, QParam;
var cutOff, resonance;
var analyser, canvas, canvasCtx, dataArray

const configureAudioGraph = async () => {

    oscillator = new OscillatorNode(audioCtx, {
        frequency: 300,
        type: "square",
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
    })
    oscillator.start();
    
    await setupFilter();

    setupOscilloscope();

    oscillator.connect(ladderNode).connect(audioCtx.destination)
    ladderNode.connect(analyser, 0, 0);

    
};
const setupFilter = async () => {
    await audioCtx.audioWorklet.addModule('wasm-worklet-processor.js');
    ladderNode = new AudioWorkletNode(audioCtx, 'wasm-worklet-processor');

    QParam = ladderNode.parameters.get("Q");

    const response = await fetch('filterKernel.wasm');
    const buffer   = await response.arrayBuffer();

    ladderNode.port.onmessage = (e) => {
        if ( e.data === "OK") {
            ladderNode.port.postMessage({cutOff: document.getElementById("cutOff").value});
            QParam.value = parseFloat(document.getElementById("resonance").value/20.0);           
        }
    };

    ladderNode.port.postMessage({webassembly: buffer});

}


const setupOscilloscope = () => {
    analyser =new AnalyserNode(audioCtx, {
        fftSize: 2048,
    });
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    canvas = document.getElementById("oscilloscope");
    canvasCtx = canvas.getContext("2d");
    draw();
}
window.onload = async () => {
    const startBtn = document.getElementById('startBtn');
    startBtn.addEventListener('click', async (evt) => {
        if ( evt.target.innerText === "Start" ) {
            if ( audioCtx === undefined ) {
                audioCtx = new AudioContext();
                
                await configureAudioGraph(audioCtx);
                startBtn.textContent = 'Stop';
            }
            if ( audioCtx.state === "suspended") {
                startBtn.textContent = 'Stop';
                await audioCtx.resume();
            }                   
        } else {
            audioCtx.suspend();
            startBtn.textContent = 'Start';
        }
    }, false);

    document.getElementById('frequency').addEventListener('input', (evt) => {
        oscillator.frequency.value = parseInt(evt.target.value)
        });
    document.getElementById('cutOff').addEventListener('input', (evt) => {
        ladderNode.port.postMessage({cutOff: evt.target.value})
        });
    document.getElementById('resonance').addEventListener('input', (evt) => {
        QParam.value = parseFloat(evt.target.value)/20.0;
        });
}
function draw() {
    requestAnimationFrame(draw);
  
    analyser.getByteTimeDomainData(dataArray);
  
    canvasCtx.fillStyle = "darkgreen";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
  
    canvasCtx.lineWidth = 1;
    canvasCtx.strokeStyle = "yellow";
  
    canvasCtx.beginPath();

    let x = 0;
    let start = 0;
    for ( let i=1 ; i<500 ; i++ ) {;
        if ((dataArray[i-1] < 128) && (dataArray[i] > 128)) {
            start = i  - 30;
            break;
        }
    }

    canvasCtx.moveTo(x, dataArray[start]);
    for (let i = start; i < canvas.width ; i++) {
        canvasCtx.lineTo(x, dataArray[i]);
        x += 1;
    }
    canvasCtx.stroke();
  }