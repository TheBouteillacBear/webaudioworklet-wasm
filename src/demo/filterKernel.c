
#include <emscripten.h>

//  emcc -O3 -s WASM=1  filterKernel.c -o filterKernel.wasm --no-entry

float _PI = 3.14159265359;
float _SAMPLERATE = 44100;

static float inputBuffer[128];
static float outputBuffer[128];

double p0,  p1,  p2, p3;
double p32, p33, p34;

float resonance;
EMSCRIPTEN_KEEPALIVE
    void setResonance(float r) {
        resonance = r;
    }
float cutoff;
EMSCRIPTEN_KEEPALIVE
    void setCutoff(float c){
        cutoff = c * 2 * _PI / _SAMPLERATE;
        cutoff = (cutoff > 1) ? 1 : cutoff;
    }
inline double fast_tanh(double x) {
	double x2 = x * x;
	return x * (27.0 + x2) / (27.0 + 9.0 * x2);
}
EMSCRIPTEN_KEEPALIVE
    void init() {
        p0 = p1 = p2 = p3 = p32 = p33 = p34 = 0.0f;
        setCutoff(1000.0f);
        setResonance(0.70f);
    }
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

		    double k = resonance * 4;

            double out = p3 * 0.360891 + p32 * 0.417290 + p33 * 0.177896 + p34 * 0.0439725;

            p34 = p33; p33 = p32; p32 = p3;

            p0 += (fast_tanh(inputBuffer[i] - k * out) - fast_tanh(p0)) * cutoff;
            p1 += (fast_tanh(p0) - fast_tanh(p1)) * cutoff;
            p2 += (fast_tanh(p1) - fast_tanh(p2)) * cutoff;
            p3 += (fast_tanh(p2) - fast_tanh(p3)) * cutoff;

            outputBuffer[i] = out;
        }
    }

