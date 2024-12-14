import { WGPU_RENDERER } from "../main.js";
import { util } from "../util.js";
import { ColorSpace } from "../renderer.js";

// TODO: If I have the time I should come back and move the styles to a separate file

export class Sidebar {
    private element: HTMLElement;
    private resizer: HTMLElement;
    private toggleButton: HTMLElement;
    private content: HTMLElement;
    private isExpanded: boolean = true;
    private minWidth: number = 200;
    private maxWidth: number = window.innerWidth * 0.6;

    // Get current state of the sidebar
    public get expanded(): boolean {
        return this.isExpanded;
    }

    // Toggle sidebar programmatically
    public toggle(): void {
        this.isExpanded = !this.isExpanded;
        this.element.style.transform = this.isExpanded ? 'translateX(0)' : 'translateX(100%)';
        this.toggleButton.innerHTML = this.isExpanded ? '→' : '←';
    }

    constructor() {
        this.element = document.createElement('div');
        this.content = document.createElement('div');
        this.resizer = document.createElement('div');
        this.toggleButton = document.createElement('button');

        this.initSidebar();
        this.setupResizer();
        this.setupToggle();
    }

    // Method to initialize the sidebar
    private initSidebar(): void {
        this.element.className = 'sidebar';
        this.element.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            height: 100vh;
            width: 300px;
            background: rgba(255, 255, 255, 0.1); /* Transparent background */
            border: 1px solid rgba(45, 45, 45, 0.3); /* Subtle border */
            backdrop-filter: blur(10px); /* Frosted glass effect */
            -webkit-backdrop-filter: blur(10px); /* For Safari */
            border-radius: 10px; /* Rounded corners */
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); /* Subtle shadow */
            color: #ffffff;
            transition: transform 0.3s ease;
            display: flex;
            flex-direction: row;
            z-index: 1000;
            transparent: 0.9;
        `;


        this.content.className = 'sidebar-content';
        this.content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 5px;
            display: flex;
            flex-direction: column;
            gap: 5px;
        `;

        this.resizer.className = 'sidebar-resizer';
        this.resizer.style.cssText = `
            width: 5px;
            height: 100%;
            background: 333;
            color: #ffffff;
            cursor: col-resize;
            transition: background-color 0.3s ease;
        `;

        this.toggleButton.className = 'sidebar-toggle';
        this.toggleButton.innerHTML = '→';
        this.toggleButton.style.cssText = `
            position: absolute;
            left: -30px;
            top: 50%;
            transform: translateY(-50%);
            width: 30px;
            height: 60px;
            background: rgba(255, 255, 255, 0.1); /* Transparent background */
            border: 1px solid rgba(45, 45, 45, 0.3); /* Subtle border */
            backdrop-filter: blur(10px); /* Frosted glass effect */
            -webkit-backdrop-filter: blur(10px); /* For Safari */
            border-radius: 10px; /* Rounded corners */
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); /* Subtle shadow */
            color: #ffffff;
            color: white;
            cursor: pointer;
            padding: 5px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            border-radius: 5px 0 0 5px;
        `;

        // Append elements
        this.element.appendChild(this.resizer);
        this.element.appendChild(this.content);
        this.element.appendChild(this.toggleButton);
        document.body.appendChild(this.element);
    }

    // Method to setup the resizer sidebar element
    private setupResizer(): void {
        let startX: number;
        let startWidth: number;

        const startResize = (e: MouseEvent) => {
            startX = e.clientX;
            startWidth = this.element.offsetWidth;
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
        };

        const resize = (e: MouseEvent) => {
            const width = startWidth - (e.clientX - startX);
            if (width >= this.minWidth && width <= this.maxWidth) {
                this.element.style.width = `${width}px`;
            }
        };

        const stopResize = () => {
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResize);
        };

        this.resizer.addEventListener('mousedown', startResize);
    }

    private setupToggle(): void {
        this.toggleButton.addEventListener('click', () => {
            this.isExpanded = !this.isExpanded;
            this.element.style.transform = this.isExpanded ? 'translateX(0)' : 'translateX(100%)';
            this.toggleButton.innerHTML = this.isExpanded ? '→' : '←';
        });
        // draggable
        this.element.addEventListener('dragstart', (event) => {
            event.preventDefault();
        });
    }

    // Method to add a section to the sidebar
    public addSection(title: string, isCollapsible: boolean = true): HTMLElement {
        const section = document.createElement('button');
        section.className = 'sidebar-section';
        section.style.cssText = `
        background-color: rgba(45, 45, 45, 0.5);
        border-radius: 5px;
        border: 1px solid rgba(22, 22, 22, 0.6); /* Subtle border */
        padding: 10px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        cursor: ${isCollapsible ? 'pointer' : 'default'};
        user-select: none; /* Prevents text selection */
        -webkit-user-select: none; /* For Safari */
    `;

        const headerContainer = document.createElement('div');
        headerContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: ${isCollapsible ? 'pointer' : 'default'};
        keyboard-focus: true;
    `;

        const sectionTitle = document.createElement('h3');
        sectionTitle.textContent = title;
        sectionTitle.style.cssText = `
        margin: 0;
        color: #ffffff;
        font-size: 20px;
        font-weight: 500;
    `;

        headerContainer.appendChild(sectionTitle);
        section.appendChild(headerContainer);

        const contentContainer = document.createElement('div');
        contentContainer.style.cssText = `
        transition: max-height 0.3s ease, opacity 0.3s ease;
        overflow: hidden;
        max-height: 0px;
        opacity: 0;
    `;

        if (isCollapsible) {
            const toggleIcon = document.createElement('span');
            toggleIcon.innerHTML = '▼';
            toggleIcon.style.cssText = `
            font-size: 12px;
            transition: transform 0.3s ease;
            color: #ffffff;
        `;
            headerContainer.appendChild(toggleIcon);

            let isExpanded = false;
            section.addEventListener('click', () => {
                isExpanded = !isExpanded;
                toggleIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
                contentContainer.style.maxHeight = isExpanded ? '1000px' : '0';
                contentContainer.style.opacity = isExpanded ? '1' : '0';
            });
        }

        section.appendChild(contentContainer);
        this.content.appendChild(section);

        return contentContainer;
    }

    // Method to add controls section to the sidebar from the controls list
    public addControls(): void {
        const controlsSection = this.addSection('⌨ Controls', true);
        const controlsContainer = document.createElement('div');
        controlsContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        background-color: rgba(45, 45, 45, 0.5);
        border: 1px solid rgba(22, 22, 22, 0.6); /* Subtle border */
        border-radius: 4px;
        margin-left: 5px;
        margin-right: 5px;
    `;

        const controlList = WGPU_RENDERER.controls.getControlList();

        controlList.forEach((action) => {

            let { key, description } = action;

            if (key === ' ') {
                key = 'Space';
            }

            const controlItem = document.createElement('div');
            controlItem.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
        `;

            const keyElement = document.createElement('kbd');
            keyElement.textContent = key;
            keyElement.style.cssText = `
            background-color: #404040;
            color: #fff;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            min-width: 24px;
            text-align: center;
            display: inline-block;
            box-shadow: 0 2px 0 #222;
        `;

            const descElement = document.createElement('span');
            descElement.textContent = description;
            descElement.style.cssText = `
            color: #ddd;
            font-size: 14px;
        `;

            controlItem.appendChild(keyElement);
            controlItem.appendChild(descElement);
            controlsContainer.appendChild(controlItem);
        });

        controlsSection.appendChild(controlsContainer);

        this.content.appendChild(controlsSection);
    }

    // Function to create a file upload button for PPM3 files
    public addPPMUploadButton(): void {
        const uploadSection = this.addSection('📤 PPM Upload', true);
        const uploadContainer = document.createElement('div');
        uploadContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        background-color: rgba(45, 45, 45, 0.5);
        border: 1px solid rgba(22, 22, 22, 0.6);
        border-radius: 4px;
        margin-left: 5px;
        margin-right: 5px;
    `;

        const uploadButton = document.createElement('input');
        uploadButton.type = 'file';
        uploadButton.accept = '.ppm';
        uploadButton.style.cssText = `
        background-color: #404040;
        color: #fff;
        padding: 8px 12px;
        border-radius: 4px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        cursor: pointer;
    `;

        const removeTextureButton = document.createElement('button');
        removeTextureButton.textContent = 'Remove Texture';
        removeTextureButton.style.cssText = `
        background-color: #404040;
        color: #fff;
        padding: 8px 12px;
        border-radius: 4px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        cursor: pointer;
    `;

        uploadButton.addEventListener('change', async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) {
                console.error("No file selected.");
                return;
            }

            const text = await file.text();
            const ppm = util.parsePPM3(text);
            if (ppm) {
                // Further processing or visualization logic can go here.
                WGPU_RENDERER.ppmTextureData = ppm;
                WGPU_RENDERER.setColorSpace(WGPU_RENDERER.currentColorSpace);
            };
        });

        removeTextureButton.addEventListener('click', () => {
            WGPU_RENDERER.removePPMTexture();
            WGPU_RENDERER.setColorSpace(WGPU_RENDERER.currentColorSpace);
        });

        uploadContainer.appendChild(uploadButton);
        uploadContainer.appendChild(removeTextureButton);
        uploadSection.appendChild(uploadContainer);
        this.content.appendChild(uploadSection);
    }

    public addDefaultColourSpaces(): void {
        
        const colourSpacesSection = this.addSection('🌈 Colour Spaces', true);
        const colourSpacesContainer = document.createElement('div');
        colourSpacesContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        background-color: rgba(45, 45, 45, 0.5);
        border: 1px solid rgba(22, 22, 22, 0.6);
        border-radius: 4px;
        margin-left: 5px;
        margin-right: 5px;
    `;
        

        let keys = Object.keys(ColorSpace);

        keys.forEach((key) => {

            let space = key;

            const spaceItem = document.createElement('div');
            spaceItem.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
            cursor: pointer;
        `;

            const spaceName = document.createElement('span');
            spaceName.textContent = space;
            spaceName.style.cssText = `
            color: #fff;
            font-size: 16px;
        `;

            spaceItem.addEventListener('click', () => {
                //WGPU_RENDERER.ppmTextureData = undefined;

                WGPU_RENDERER.setColorSpace(space as ColorSpace);
            });

            spaceItem.appendChild(spaceName);
            colourSpacesContainer.appendChild(spaceItem);
        });

        colourSpacesSection.appendChild(colourSpacesContainer);
        this.content.appendChild(colourSpacesSection);
    }
}
