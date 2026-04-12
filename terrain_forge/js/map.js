/**
 * MapModule handles the interactive map, area selection and location searching.
 */
const MapModule = (() => {
    let map;
    let selectionRect;
    let isSelecting = false;
    let startLatLng;
    
    const mapConfig = {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 18
    };

    function init() {
        map = L.map('map').setView(mapConfig.center, mapConfig.zoom);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO'
        }).addTo(map);

        // Selection rectangle initialization
        selectionRect = L.rectangle([[0, 0], [0, 0]], {
            color: '#00d4ff',
            weight: 2,
            fillColor: '#00d4ff',
            fillOpacity: 0.2,
            interactive: false
        }).addTo(map);
        selectionRect.setLatLngs([[0, 0], [0, 0]]); // Hide initially

        setupEventListeners();
    }

    function setupEventListeners() {
        map.on('mousedown', (e) => {
            if (e.originalEvent.shiftKey || e.originalEvent.ctrlKey) {
                isSelecting = true;
                startLatLng = e.latlng;
                selectionRect.setLatLngs([[startLatLng, startLatLng]]);
                map.on('mousemove', onMouseMove);
                map.on('mouseup', onMouseUp);
            }
        });
    }

    function onMouseMove(e) {
        if (!isSelecting) return;
        const bounds = [
            [Math.min(startLatLng.lat, e.latlng.lat), Math.min(startLatLng.lng, e.latlng.lng)],
            [Math.max(startLatLng.lat, e.latlng.lat), Math.max(startLatLng.lng, e.latlng.lng)]
        ];
        selectionRect.setLatLngs(bounds);
        updateAreaInfo(bounds);
    }

    function onMouseUp(e) {
        if (!isSelecting) return;
        isSelecting = false;
        map.off('mousemove', onMouseMove);
        map.off('mouseup', onMouseUp);
    }

    function updateAreaInfo(bounds) {
        const southWest = bounds[0];
        const northEast = bounds[1];
        
        const latDiff = Math.abs(northEast[0] - southWest[0]);
        const lngDiff = Math.abs(northEast[1] - southWest[1]);
        
        // Rough conversion to km
        const heightKm = latDiff * 111;
        const widthKm = lngDiff * 111 * Math.cos(southWest[0] * Math.PI / 180);
        
        document.getElementById('area-dim').textContent = `${widthKm.toFixed(2)} x ${heightKm.toFixed(2)} km`;
        
        // Estimate resolution based on selected image size (1024 by default)
        const resSelect = document.getElementById('res-select');
        const targetRes = parseInt(resSelect.value);
        const pxPerKm = targetRes / Math.max(widthKm, heightKm);
        document.getElementById('area-res').textContent = `${pxPerKm.toFixed(2)} px/km`;
    }

    async function searchLocation(query) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            const data = await response.json();
            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                map.setView([lat, lon], 12);
                return { lat: parseFloat(lat), lon: parseFloat(lon) };
            }
            return null;
        } catch (error) {
            console.error("Search error:", error);
            return null;
        }
    }

    function getSelectedBounds() {
        const bounds = selectionRect.getBounds();
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) return null;
        
        return {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest()
        };
    }

    return {
        init,
        searchLocation,
        getSelectedBounds
    };
})();
