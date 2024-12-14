// Utility functions for miscellaneous tasks that might need to be performed in multiple places
export class util {
    static parsePPM3(ppmText) {
        const lines = ppmText.split('\n').map(line => line.trim());
        if (lines[0] !== 'P3') {
            console.error('Invalid PPM format. Expected P3 header.');
            return null;
        }
        let i = 1;
        while (lines[i].startsWith('#')) {
            i++; // Skip comments
        }
        const [width, height] = lines[i].split(' ').map(Number);
        const maxval = parseInt(lines[i + 1]);
        const pixels = [];
        for (const line of lines.slice(i + 2)) {
            pixels.push(...line.split(' ').map(Number));
        }
        // I do not know why I could not add 255 in the pixels.push above
        // but for whatever reason the values literally never appeared in the array
        const new_pixels = [];
        for (let i = 0; i < pixels.length; i += 3) {
            new_pixels.push(pixels[i], pixels[i + 1], pixels[i + 2], 255);
        }
        return { width, height, maxval, data: Uint8Array.from(new_pixels) };
    }
}
