const globe = Globe()
(document.getElementById('globeViz'))

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

// Store ISS path
const orbitPath = [];

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

    // Save orbit positions
    orbitPath.push({
        lat: data.latitude,
        lng: data.longitude
    });

    // Keep last 200 points
    if (orbitPath.length > 200) {
        orbitPath.shift();
    }

    // ISS marker
    globe.pointsData([
        {
            lat: data.latitude,
            lng: data.longitude,
            size: 1,
            color: 'red'
        }
    ]);

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