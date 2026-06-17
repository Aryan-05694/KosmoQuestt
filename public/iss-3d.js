const globe = Globe()(document.getElementById('globeViz'))
  .globeImageUrl(
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
  )
  .backgroundImageUrl(
    'https://unpkg.com/three-globe/example/img/night-sky.png'
  );

// Controls
globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.5;

globe
  .showAtmosphere(true)
  .atmosphereAltitude(0.2);

// -------------------------
// ISS Marker (initialized once)
// -------------------------
const issMarker = {
  lat: 0,
  lng: 0
};

globe.htmlElementsData([issMarker]);

globe.htmlElement(() => {
  const img = document.createElement('img');
  img.src = 'iss1.png';
  img.style.width = '50px';
  img.style.height = '50px';
  return img;
});

// -------------------------
// Orbit path storage
// -------------------------
const orbitPath = [];

// -------------------------
// Camera tracking control
// -------------------------
let firstUpdate = true;

// -------------------------
// Update function
// -------------------------
async function updateISS() {
  try {
    const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
    const data = await res.json();

    // UI updates
    document.getElementById("lat").textContent = data.latitude.toFixed(2);
    document.getElementById("lon").textContent = data.longitude.toFixed(2);
    document.getElementById("alt").textContent = data.altitude.toFixed(2);
    document.getElementById("vel").textContent = Math.round(data.velocity);

    // Update ISS marker position
    issMarker.lat = data.latitude;
    issMarker.lng = data.longitude;

    globe.htmlElementsData([issMarker]);

    // Save orbit path
    orbitPath.push({
      lat: data.latitude,
      lng: data.longitude
    });

    if (orbitPath.length > 200) {
      orbitPath.shift();
    }

    globe
      .pathsData([
        {
          coords: orbitPath
        }
      ])
      .pathColor(() => '#00ffff')
      .pathStroke(1);

    // -------------------------
    // Camera follow (FIXED)
    // -------------------------
    if (firstUpdate) {
      globe.pointOfView(
        {
          lat: data.latitude,
          lng: data.longitude,
          altitude: 2
        },
        0 // no animation on first load
      );
      firstUpdate = false;
    }

    // Optional smooth follow (slower updates prevent “reset feel”)
    globe.pointOfView(
      {
        lat: data.latitude,
        lng: data.longitude,
        altitude: 2
      },
      1500 // smoother transition
    );

  } catch (err) {
    console.error("ISS update failed:", err);
  }
}

// Initial call
updateISS();

// Update every 5 seconds
setInterval(updateISS, 5000);