// Create map
const map = L.map('map').setView([0, 0], 2);

// Dark space-style map
L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }
).addTo(map);

// ISS icon
const issIcon = L.icon({
    iconUrl: "iss.png",
    iconSize: [50, 50],
    iconAnchor: [25, 25]
});

// ISS marker
const marker = L.marker([0, 0], {
    icon: issIcon
}).addTo(map);

// Orbit trail
const orbitPoints = [];

const orbitLine = L.polyline([], {
    color: '#00ffff',
    weight: 3,
    opacity: 0.8
}).addTo(map);

// Update ISS location
async function updateISS() {
    try {
        const response = await fetch(
            "https://api.wheretheiss.at/v1/satellites/25544"
        );

        const data = await response.json();

        const lat = data.latitude;
        const lon = data.longitude;

        // Move ISS marker
        marker.setLatLng([lat, lon]);

        // Smoothly follow ISS
        map.panTo([lat, lon], {
            animate: true,
            duration: 1
        });

        // Store orbit points
        orbitPoints.push([lat, lon]);

        // Keep last 100 positions only
        if (orbitPoints.length > 100) {
            orbitPoints.shift();
        }

        // Draw orbit trail
        orbitLine.setLatLngs(orbitPoints);

        // Update stats
        document.getElementById("lat").textContent =
            lat.toFixed(2) + "°";

        document.getElementById("lon").textContent =
            lon.toFixed(2) + "°";

        document.getElementById("alt").textContent =
            data.altitude.toFixed(2) + " km";

        document.getElementById("vel").textContent =
            Math.round(data.velocity) + " km/h";

        // Optional timestamp
        const timeElement = document.getElementById("updated");

        if (timeElement) {
            timeElement.textContent =
                new Date().toLocaleTimeString();
        }

    } catch (error) {
        console.error("ISS update failed:", error);
    }
}

// Placeholder astronaut count
async function getAstronauts() {
    const crewElement = document.getElementById("crew");

    if (crewElement) {
        crewElement.textContent = "Live crew data coming soon";
    }
}

// Initial load
updateISS();
getAstronauts();

// Refresh every 5 seconds
setInterval(updateISS, 5000);