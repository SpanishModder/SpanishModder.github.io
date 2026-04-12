/**
 * UIModule handles user interface interactions and DOM updates.
 */
const UIModule = (() => {
    const elements = {
        resSelect: document.getElementById('res-select'),
        formatSelect: document.getElementById('format-select'),
        presetSelect: document.getElementById('preset-select'),
        heightScale: document.getElementById('height-scale'),
        scaleVal: document.getElementById('scale-val'),
        invertMap: document.getElementById('invert-map'),
        blurSlider: document.getElementById('blur-slider'),
        blurVal: document.getElementById('blur-val'),
        generateBtn: document.getElementById('generate-btn'),
        downloadBtn: document.getElementById('download-btn'),
        overlay: document.getElementById('overlay'),
        progressFill: document.getElementById('progress-fill'),
        loaderText: document.getElementById('loader-text'),
        canvas2d: document.getElementById('canvas-2d'),
        tabs: document.querySelectorAll('.tab-btn'),
        panes: document.querySelectorAll('.preview-pane')
    };

    function init(onGenerate) {
        // Tab switching
        elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                elements.tabs.forEach(t => t.classList.remove('active'));
                elements.panes.forEach(p => p.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(`preview-${target}`).classList.add('active');
            });
        });

        // Slider updates
        elements.heightScale.addEventListener('input', (e) => {
            elements.scaleVal.textContent = `${e.target.value}x`;
        });

        elements.blurSlider.addEventListener('input', (e) => {
            elements.blurVal.textContent = `${e.target.value}px`;
        });

        // Generate button
        elements.generateBtn.addEventListener('click', onGenerate);
    }

    function showLoading(text = "Procesando terreno...") {
        elements.loaderText.textContent = text;
        elements.overlay.classList.remove('hidden');
        elements.progressFill.style.width = '0%';
    }

    function updateProgress(percent) {
        elements.progressFill.style.width = `${percent}%`;
    }

    function hideLoading() {
        elements.overlay.classList.add('hidden');
    }

    function setDownloadEnabled(enabled) {
        elements.downloadBtn.disabled = !enabled;
    }

    function getOptions() {
        return {
            resolution: parseInt(elements.resSelect.value),
            format: elements.formatSelect.value,
            preset: elements.presetSelect.value,
            scale: parseFloat(elements.heightScale.value),
            invert: elements.invertMap.checked,
            blur: parseInt(elements.blurSlider.value)
        };
    }

    function updatePreview2D(canvas) {
        const placeholder = document.querySelector('#preview-2d .preview-placeholder');
        if (placeholder) placeholder.classList.add('hidden');

        elements.canvas2d.width = canvas.width;
        elements.canvas2d.height = canvas.height;
        const ctx = elements.canvas2d.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
    }

    return {
        init,
        showLoading,
        updateProgress,
        hideLoading,
        setDownloadEnabled,
        getOptions,
        updatePreview2D
    };
})();
