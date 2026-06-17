const globe = Globe()(document.getElementById('globeViz'))

.globeImageUrl(
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
)

.backgroundImageUrl(
    'https://unpkg.com/three-globe/example/img/night-sky.png'
);

globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.5;

globe
    .showAtmosphere(true)
    .atmosphereAltitude(0.2);

// Orbit path storage
const orbitPath = [];

// ISS marker
const issMarker = {
    lat: 0,
    lng: 0
};

globe
    .htmlElementsData([issMarker])
    .htmlElement(() => {
        const img = document.createElement('img');

        img.src = 'images/iss.png'; // change path if needed

        img.style.width = '50px';
        img.style.height = '50px';

        return img;
    });

async function updateISS() {

    const res = await fetch(
        'https://api.wheretheiss.at/v1/satellites/25544'
    );

    const data = await res.json();

    // Update stats
    document.getElementById("lat").textContent =
        data.latitude.toFixed(2);

    document.getElementById("lon").textContent =
        data.longitude.toFixed(2);

    document.getElementById("alt").textContent =
        data.altitude.toFixed(2);

    document.getElementById("vel").textContent =
        Math.round(data.velocity);

    // Update ISS marker position
    issMarker.lat = data.latitude;
    issMarker.lng = data.longitude;

    globe.htmlElementsData([issMarker]);

    // Save orbit positions
    orbitPath.push({
        lat: data.latitude,
        lng: data.longitude
    });

    if (orbitPath.length > 200) {
        orbitPath.shift();
    }

    // Orbit trail
    globe
        .pathsData([
            {
                coords: orbitPath
            }
        ])
        .pathColor(() => '#00ffff')
        .pathStroke(1);

    // Camera follow
    globe.pointOfView(
        {
            lat: data.latitude,
            lng: data.longitude,
            altitude: 2
        },
        1000
    );
}

updateISS();

setInterval(updateISS, 5000);