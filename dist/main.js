import { Renderer } from './renderer.js';
import { Sidebar } from './ui/sidebar.js';
const canvas = document.querySelector('canvas');
const sidebar = new Sidebar();
const renderer = new Renderer(canvas);
export const WGPU_RENDERER = renderer;
export const WGPU_SIDEBAR = sidebar;
// Program entrypoint
async function main() {
    if (!canvas) {
        throw new Error("No canvas element found");
    }
    // Initialize the WebGPU renderer context 
    await renderer.init();
    sidebar.addControls();
    sidebar.addPPMUploadButton();
    sidebar.addDefaultColourSpaces();
    function frame(timestamp) {
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
    renderer.msaa.texture.destroy();
    renderer.msaa.texture = renderer.device.createTexture({
        size: {
            width: canvas.width,
            height: canvas.height,
        },
        sampleCount: 4,
        format: navigator.gpu.getPreferredCanvasFormat(),
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    renderer.msaa.view = renderer.msaa.texture.createView();
    renderer.depthTexture.texture.destroy();
    renderer.depthTexture.texture = renderer.device.createTexture({
        size: {
            width: canvas.width,
            height: canvas.height,
        },
        sampleCount: 4,
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    renderer.depthTexture.view = renderer.depthTexture.texture.createView();
});
main().catch(console.error);
