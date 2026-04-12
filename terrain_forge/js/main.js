/**
 * Main application coordinator.
 */
const App = (() => {
    let currentCanvas = null;

    async function init() {
        MapModule.init();
        UIModule.init(handleGenerate);
        Preview3DModule.init();

        // Detect if running from file://
        if (window.location.protocol === 'file:') {
            document.getElementById('cors-warning').classList.remove('hidden');
        }

        // Load saved token
        const savedToken = localStorage.getItem('api_token');
        const savedProvider = localStorage.getItem('api_provider') || 'opentopo';
        
        if (savedToken) {
            document.getElementById('api-token').value = savedToken;
        }
        document.getElementById('provider-select').value = savedProvider;

        // Update hint based on provider
        updateProviderHint(savedProvider);

        // Save token functionality
        document.getElementById('save-token-btn').addEventListener('click', () => {
            const token = document.getElementById('api-token').value.trim();
            const provider = document.getElementById('provider-select').value;
            if (token) {
                localStorage.setItem('api_token', token);
                localStorage.setItem('api_provider', provider);
                alert("Configuración guardada correctamente.");
            } else {
                alert("Por favor, introduce un token válido.");
            }
        });

        // Provider switch logic
        document.getElementById('provider-select').addEventListener('change', (e) => {
            updateProviderHint(e.target.value);
        });

        // Search functionality
        document.getElementById('search-btn').addEventListener('click', async () => {
            const query = document.getElementById('location-search').value;
            if (query) {
                await MapModule.searchLocation(query);
            }
        });

        // Download functionality
        document.getElementById('download-btn').addEventListener('click', handleDownload);
    }

    function updateProviderHint(provider) {
        const hint = document.getElementById('token-hint');
        if (provider === 'opentopo') {
            hint.textContent = "OpenTopography no requiere tarjeta de crédito para su API gratuita.";
        } else {
            hint.textContent = "Mapbox requiere registro y puede solicitar tarjeta para el tier gratuito.";
        }
    }

    async function handleGenerate() {
        const bounds = MapModule.getSelectedBounds();
        if (!bounds) {
            alert("Por favor, selecciona un área en el mapa manteniendo Shift + Arrastrar.");
            return;
        }

        const token = document.getElementById('api-token').value.trim();
        const provider = document.getElementById('provider-select').value;

        if (!token) {
            alert(`Es necesario configurar el token de ${provider === 'opentopo' ? 'OpenTopography' : 'Mapbox'} en el panel de API Config.`);
            return;
        }

        const options = UIModule.getOptions();
        options.provider = provider; // Pass provider to the generator
        UIModule.showLoading();

        try {
            HeightmapModule.setToken(token);
            
            const canvas = await HeightmapModule.generate(bounds, options, (progress) => {
                UIModule.updateProgress(progress);
            });

            currentCanvas = canvas;
            UIModule.updatePreview2D(canvas);
            Preview3DModule.updateMesh(canvas);
            UIModule.setDownloadEnabled(true);

        } catch (error) {
            alert(error.message);
        } finally {
            UIModule.hideLoading();
        }
    }

    function handleDownload() {
        if (!currentCanvas) return;

        const options = UIModule.getOptions();
        const { format } = options;

        if (format === 'png') {
            downloadPNG();
        } else if (format === 'raw') {
            downloadRAW();
        }
    }

    function downloadPNG() {
        const link = document.createElement('a');
        link.download = `heightmap_${Date.now()}.png`;
        link.href = currentCanvas.toDataURL('image/png');
        link.click();
    }

    function downloadRAW() {
        const ctx = currentCanvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, currentCanvas.width, currentCanvas.height);
        
        const buffer = new ArrayBuffer(currentCanvas.width * currentCanvas.height * 2);
        const view = new DataView(buffer);
        
        for (let i = 0; i < imgData.data.length / 4; i++) {
            const val = imgData.data[i * 4]; 
            const rawVal = Math.floor((val / 255) * 65535);
            view.setUint16(i * 2, rawVal, true); 
        }

        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.download = `heightmap_${Date.now()}.raw`;
        link.href = URL.createObjectURL(blob);
        link.click();
    }

    return {
        init
    };
})();

window.addEventListener('DOMContentLoaded', App.init);
