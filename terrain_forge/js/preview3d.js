/**
 * Preview3DModule handles the 3D WebGL visualization of the heightmap.
 */
const Preview3DModule = (() => {
    let scene, camera, renderer, controls, mesh;
    let container = document.getElementById('three-canvas-container');

    function init() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a0f);

        camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.set(50, 50, 50);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        
        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.position.set(10, 50, 10);
        scene.add(sunLight);

        window.addEventListener('resize', onWindowResize);
        animate();
    }

    function onWindowResize() {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }

    function updateMesh(canvas) {
        const placeholder = document.querySelector('#preview-3d .preview-placeholder');
        if (placeholder) placeholder.classList.add('hidden');

        if (mesh) scene.remove(mesh);

        const size = canvas.width;
        const geometry = new THREE.PlaneGeometry(100, 100, size - 1, size - 1);
        
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, size, size).data;
        
        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = (i / 3) % size; // This is not quite right for PlaneGeometry
            // PlaneGeometry vertices are ordered differently. 
            // We need to map the image data to the vertices.
        }
        
        // Correct mapping for PlaneGeometry (vertices are typically ordered by row then col)
        const rowSize = size;
        for (let i = 0; i < vertices.length / 3; i++) {
            const row = Math.floor(i / rowSize);
            const col = i % rowSize;
            const pixelIdx = (row * rowSize + col) * 4;
            const height = imgData[pixelIdx] / 255;
            vertices[i * 3 + 2] = height * 20; // Scale height for visual effect
        }
        
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            wireframe: false,
            flatShading: false
        });
        
        mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    return {
        init,
        updateMesh
    };
})();
