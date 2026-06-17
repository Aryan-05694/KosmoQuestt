const globe = Globe()
(document.getElementById('globeViz'))

.globeImageUrl(
'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
)

.backgroundImageUrl(
'https://unpkg.com/three-globe/example/img/night-sky.png'
);

async function updateISS() {

    const res = await fetch(
        'https://api.wheretheiss.at/v1/satellites/25544'
    );

    const data = await res.json();

    globe.pointsData([
        {
            lat: data.latitude,
            lng: data.longitude,
            size: 1,
            color: 'red'
        }
    ]);
}

updateISS();

setInterval(updateISS, 5000);