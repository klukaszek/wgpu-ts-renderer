import { vec3, quat } from 'gl-matrix';
export class Object3D {
    ;
    constructor(device) {
        this.position = vec3.create();
        this.rotation = quat.create();
        this.scale = vec3.fromValues(1, 1, 1);
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.bindGroup = null;
        this.vertices = null;
        this.indices = null;
        this.device = device;
        this.initBuffers();
        this.initPipeline();
    }
}
