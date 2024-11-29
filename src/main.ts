import { Renderer } from './renderer.js';

const canvas = document.querySelector('canvas')!;
const renderer = new Renderer(canvas)!;

// Program entrypoint
async function main() {
    if (!canvas) {
        throw new Error("No canvas element found");
    }

    // Initialize the WebGPU renderer context 
    await renderer.init();

    function frame(timestamp: number) {
        renderer.render(timestamp);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

// on resize, update the canvas size and resize the camera aspect ratio
window.addEventListener('resize', () => {
    if (!canvas) {
        throw new Error("No canvas element found");
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Update the camera aspect ratio
    renderer.camera.updateAspectRatio(canvas.width / canvas.height);

    // Resize the MSAA texture to match the canvas size
    renderer.msaaTexture.destroy()!;
    renderer.msaaTexture = renderer.device.createTexture({
        size: {
            width: canvas.width,
            height: canvas.height,
        },
        sampleCount: 4,
        format: navigator.gpu.getPreferredCanvasFormat(),
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    renderer.msaaTextureView = renderer.msaaTexture.createView();

});

main().catch(console.error);
