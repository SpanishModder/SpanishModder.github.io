/**
 * HeightmapModule handles fetching elevation data and processing it into images.
 */
const HeightmapModule = (() => {
    let activeToken = '';

    function setToken(token) {
        activeToken = token;
    }

    /**
     * Decodes Mapbox Terrain-RGB values to meters.
     */
    function decodeRGB(r, g, b) {
        return -10000 + ((r * 65536 + g * 256 + b) * 0.1);
    }

    /**
     * Main generation entry point.
     */
    async function generate(bounds, options, onProgress) {
        const { provider } = options;

        if (provider === 'mapbox') {
            return generateMapbox(bounds, options, onProgress);
        } else {
            return generateOpenTopography(bounds, options, onProgress);
        }
    }

    async function generateOpenTopography(bounds, options, onProgress) {
        if (!activeToken) throw new Error("Se requiere un token de OpenTopography.");

        const { resolution, scale, invert, blur } = options;

        const baseUrl = `https://opentopography.org/api/otraster?demtype=SRTMGL1&south=${bounds.south}&north=${bounds.north}&west=${bounds.west}&east=${bounds.east}&outputFormat=PNG&api_key=${activeToken}`;
        const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`;

        if (onProgress) onProgress(20);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenTopography Error: ${errText}`);
            }

            const blob = await response.blob();
            const img = await loadImage(blob);
            
            if (onProgress) onProgress(60);

            const canvas = document.createElement('canvas');
            canvas.width = resolution;
            canvas.height = resolution;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(img, 0, 0, resolution, resolution);
            
            const imageData = ctx.getImageData(0, 0, resolution, resolution);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                let val = data[i] / 255; 
                const mid = 0.5;
                val = mid + (val - mid) * scale;
                val = Math.max(0, Math.min(1, val));
                if (invert) val = 1 - val;
                const color = Math.floor(val * 255);
                data[i] = data[i+1] = data[i+2] = color;
            }

            ctx.putImageData(imageData, 0, 0);

            if (blur > 0) {
                ctx.filter = `blur(${blur}px)`;
                ctx.drawImage(canvas, 0, 0);
            }

            if (onProgress) onProgress(100);
            return canvas;

        } catch (error) {
            if (error.message === 'Failed to fetch') {
                throw new Error("Error de Red: No se pudo conectar con el servidor de datos. Por favor, verifica tu conexión a internet.");
            }
            throw error;
        }
    }

    async function generateMapbox(bounds, options, onProgress) {
        const { resolution, scale, invert, blur } = options;
        const zoom = 12; 
        const { xMin, xMax, yMin, yMax } = boundsToTileRange(bounds, zoom);
        
        const canvas = document.createElement('canvas');
        canvas.width = resolution;
        canvas.height = resolution;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(resolution, resolution);

        let tilesProcessed = 0;
        const totalTiles = (xMax - xMin + 1) * (yMax - yMin + 1);
        
        let minH = Infinity;
        let maxH = -Infinity;
        const elevationData = new Float32Array(resolution * resolution);

        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                const baseUrl = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${zoom}/${x}/${y}.pngraw?access_token=${activeToken}`;
                const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`;
                const tile = await fetchTile(url);
                processTileIntoBuffer(tile, x, y, xMin, yMin, xMax, yMax, resolution, bounds, elevationData);
                tilesProcessed++;
                if (onProgress) onProgress((tilesProcessed / totalTiles) * 100);
            }
        }

        for (let i = 0; i < elevationData.length; i++) {
            if (elevationData[i] < minH) minH = elevationData[i];
            if (elevationData[i] > maxH) maxH = elevationData[i];
        }

        const range = maxH - minH;
        for (let i = 0; i < elevationData.length; i++) {
            let val = (elevationData[i] - minH) / range;
            const mid = 0.5;
            val = mid + (val - mid) * scale;
            val = Math.max(0, Math.min(1, val));
            if (invert) val = 1 - val;
            const color = Math.floor(val * 255);
            const idx = i * 4;
            imageData.data[idx] = imageData.data[idx + 1] = imageData.data[idx + 2] = color;
            imageData.data[idx + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);
        if (blur > 0) {
            ctx.filter = `blur(${blur}px)`;
            ctx.drawImage(canvas, 0, 0);
        }

        return canvas;
    }

    async function loadImage(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    async function fetchTile(url) {
        const response = await fetch(url);
        const blob = await response.blob();
        return loadImage(blob);
    }

    function processTileIntoBuffer(tile, tx, ty, xMin, yMin, xMax, yMax, resolution, bounds, buffer) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(tile, 0, 0);
        const data = ctx.getImageData(0, 0, 256, 256).data;

        const tilesW = xMax - xMin + 1;
        const tilesH = yMax - yMin + 1;

        for (let py = 0; py < 256; py++) {
            for (let px = 0; px < 256; px++) {
                const idx = (py * 256 + px) * 4;
                const h = decodeRGB(data[idx], data[idx+1], data[idx+2]);
                const canvasX = Math.floor(((tx - xMin) * 256 + px) * (resolution / (tilesW * 256)));
                const canvasY = Math.floor(((ty - yMin) * 256 + py) * (resolution / (tilesH * 256)));
                if (canvasX >= 0 && canvasX < resolution && canvasY >= 0 && canvasY < resolution) {
                    buffer[canvasY * resolution + canvasX] = h;
                }
            }
        }
    }

    function boundsToTileRange(bounds, zoom) {
        const n = Math.PI / 180;
        const x0 = Math.floor((bounds.west + 180) / 360 * Math.pow(2, zoom));
        const x1 = Math.floor((bounds.east + 180) / 360 * Math.pow(2, zoom));
        const y0 = Math.floor((1 - Math.log(Math.tan(bounds.north * n) + 1 / Math.cos(bounds.north * n)) / Math.PI) / 2 * Math.pow(2, zoom));
        const y1 = Math.floor((1 - Math.log(Math.tan(bounds.south * n) + 1 / Math.cos(bounds.south * n)) / Math.PI) / 2 * Math.pow(2, zoom));
        return { xMin: x0, xMax: x1, yMin: y0, yMax: y1 };
    }

    return {
        setToken,
        generate
    };
})();
