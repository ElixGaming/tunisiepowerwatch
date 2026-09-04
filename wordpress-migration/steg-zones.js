const stegTerritory = [
  { direction: "Direction de Distribution Grand Tunis", districts: [
    { district: "Tunis Ville", agencies: ["Tunis Ville", "Bab Souika", "Bab El Khadra", "Lafayette", "El Omrane", "Ibn Khaldoun", "El Hrairia"], zones: ["Tunis centre", "Médina", "Bab Souika", "Bab El Khadra", "El Omrane", "Ibn Khaldoun", "Séjoumi", "Hrairia"] },
    { district: "Ariana", agencies: ["Ariana", "El Menzah", "El Ghazala", "La Soukra", "Raoued"], zones: ["Ariana", "El Menzah", "El Manar", "El Ghazala", "Borj Louzir", "La Soukra", "Raoued", "Riadh El Andalous"] },
    { district: "Ben Arous", agencies: ["Ben Arous", "Mégrine", "Ezzahra", "Hammam Lif", "Bou Mhel"], zones: ["Ben Arous", "Mégrine", "Radès", "Ezzahra", "Hammam Lif", "Hammam Chott", "Bou Mhel", "Borj Cédria"] },
    { district: "El Mourouj", agencies: ["El Mourouj", "Fouchana", "M'Ghira"], zones: ["El Mourouj", "Fouchana", "M'Ghira", "Birine", "Naâssen"] },
    { district: "Manouba", agencies: ["Manouba", "Douar Hicher", "Oued Ellil"], zones: ["Manouba", "Douar Hicher", "Oued Ellil", "Den Den", "Tébourba", "Borj El Amri"] },
    { district: "La Marsa / Kram", agencies: ["La Marsa", "Le Kram", "Carthage"], zones: ["La Marsa", "Le Kram", "Carthage", "Sidi Bou Saïd", "Gammarth", "Le Lac", "Ain Zaghouan", "Bhar Lazreg"] },
  ] },
  { direction: "Direction de Distribution Nord", districts: [
    { district: "Nabeul", agencies: ["Nabeul", "Hammamet", "Korba", "Béni Khiar", "Grombalia"], zones: ["Nabeul", "Hammamet", "Korba", "Béni Khiar", "Grombalia"] },
    { district: "Menzel Temime", agencies: ["Menzel Temime", "Kélibia", "Hammam Ghezèze", "El Haouaria", "Dar Allouch"], zones: ["Menzel Temime", "Kélibia", "Hammam Ghezèze", "El Haouaria", "Dar Allouch", "Menzel Horr"] },
    { district: "Zaghouan", agencies: ["Zaghouan", "El Fahs", "Bir Mcherga", "Jebel El Oust", "Zriba"], zones: ["Zaghouan", "El Fahs", "Saouaf", "Zriba", "Bir Mcherga", "Jebel El Oust"] },
    { district: "Bizerte", agencies: ["Bizerte", "Menzel Bourguiba", "Mateur", "Tinja", "Ras Jebel"], zones: ["Bizerte", "Menzel Bourguiba", "Mateur", "Tinja", "Ras Jebel", "Menzel Abderrahmen", "El Alia", "Ghar El Melh"] },
  ] },
  { direction: "Direction de Distribution Nord-Ouest", districts: [
    { district: "Béja", agencies: [], zones: ["Béja", "Medjez El Bab", "Testour", "Téboursouk"] },
    { district: "Jendouba", agencies: [], zones: ["Jendouba", "Bou Salem", "Ghardimaou", "Tabarka", "Aïn Draham"] },
    { district: "Le Kef", agencies: [], zones: ["Le Kef", "Tajerouine", "Dahmani", "Sakiet Sidi Youssef"] },
    { district: "Siliana", agencies: [], zones: ["Siliana", "Makthar", "Bou Arada", "Gaâfour"] },
  ] },
  { direction: "Direction de Distribution Centre", districts: [
    { district: "Sousse Ville", agencies: [], zones: ["Sousse", "Sousse Médina", "Sousse Jawhara", "Sousse Riadh"] },
    { district: "Sousse Nord", agencies: [], zones: ["Hammam Sousse", "Akouda", "Hergla", "Enfidha", "Bouficha"] },
    { district: "Monastir", agencies: [], zones: ["Monastir", "Jemmal", "Moknine", "Ksar Hellal", "Téboulba"] },
    { district: "Mahdia", agencies: [], zones: ["Mahdia", "El Jem", "Ksour Essef", "Chebba", "Sidi Alouane"] },
    { district: "Kairouan", agencies: [], zones: ["Kairouan", "Haffouz", "Oueslatia", "Hajeb El Ayoun", "Nasrallah"] },
  ] },
  { direction: "Direction de Distribution Sfax", districts: [
    { district: "Sfax Ville", agencies: [], zones: ["Sfax centre", "Médina", "Bab Bhar", "Route de Tunis", "Route de l'Aéroport"] },
    { district: "Sfax Nord", agencies: [], zones: ["Sakiet Eddaïer", "Sakiet Ezzit", "Chihia", "Gremda", "El Ain", "Sidi Mansour (secteurs nord)"] },
    { district: "Sfax Sud", agencies: [], zones: ["Agareb", "Skhira", "Bir Ali Ben Khalifa", "Graïba"] },
  ] },
  { direction: "Direction de Distribution Sud", districts: [
    { district: "Gabès", agencies: [], zones: ["Gabès", "Ghannouch", "Oudhref", "Mareth", "El Hamma"] },
    { district: "Médenine", agencies: [], zones: ["Médenine", "Ben Guerdane", "Zarzis"] },
    { district: "Djerba", agencies: [], zones: ["Houmt Souk", "Midoun", "Ajim"] },
    { district: "Tataouine", agencies: [], zones: ["Tataouine", "Ghomrassen", "Bir Lahmar"] },
  ] },
  { direction: "Direction de Distribution Sud-Ouest", districts: [
    { district: "Gafsa", agencies: [], zones: ["Gafsa", "Métlaoui", "Redeyef", "Moularès", "El Guettar"] },
    { district: "Kasserine", agencies: [], zones: ["Kasserine", "Sbeitla", "Fériana", "Thala"] },
    { district: "Sidi Bouzid", agencies: [], zones: ["Sidi Bouzid", "Regueb", "Meknassy", "Jilma"] },
    { district: "Tozeur", agencies: [], zones: ["Tozeur", "Nefta", "Degache"] },
    { district: "Kébili", agencies: [], zones: ["Kébili", "Douz", "Souk Lahad"] },
  ] },
];

const districtCenters = {
  "Tunis Ville": [36.8065, 10.1815], "Ariana": [36.8625, 10.1956], "Ben Arous": [36.7531, 10.2189],
  "El Mourouj": [36.6792, 10.1561], "Manouba": [36.8080, 10.0972], "La Marsa / Kram": [36.8782, 10.3247],
  "Nabeul": [36.4513, 10.7359], "Menzel Temime": [36.7833, 10.9833], "Zaghouan": [36.4029, 10.1429],
  "Bizerte": [37.2744, 9.8739], "Béja": [36.7256, 9.1817], "Jendouba": [36.5011, 8.7802],
  "Le Kef": [36.1822, 8.7148], "Siliana": [36.0833, 9.3667], "Sousse Ville": [35.8256, 10.6370],
  "Sousse Nord": [35.8609, 10.5986], "Monastir": [35.7643, 10.8113], "Mahdia": [35.5047, 11.0622],
  "Kairouan": [35.6781, 10.0963], "Sfax Ville": [34.7406, 10.7603], "Sfax Nord": [34.7936, 10.7627],
  "Sfax Sud": [34.5279, 10.5359], "Gabès": [33.8815, 10.0982], "Médenine": [33.3549, 10.5055],
  "Djerba": [33.8076, 10.8451], "Tataouine": [32.9297, 10.4518], "Gafsa": [34.4250, 8.7842],
  "Kasserine": [35.1676, 8.8365], "Sidi Bouzid": [35.0382, 9.4849], "Tozeur": [33.9197, 8.1335],
  "Kébili": [33.7044, 8.9690],
};

const exactCoords = {
  "Tunis centre": [36.8065, 10.1815], "Médina|Tunis Ville": [36.7980, 10.1710], "Bab Souika": [36.8088, 10.1692],
  "Bab El Khadra": [36.8124, 10.1799], "El Omrane": [36.8306, 10.1575], "Ibn Khaldoun": [36.8293, 10.1209],
  "Séjoumi": [36.7538, 10.1287], "Hrairia": [36.7684, 10.1016], "Ariana": [36.8625, 10.1956], "El Menzah": [36.8385, 10.1727],
  "El Manar": [36.8319, 10.1466], "El Ghazala": [36.8995, 10.1887], "Borj Louzir": [36.8786, 10.1854], "La Soukra": [36.8772, 10.2463],
  "Raoued": [36.9492, 10.1889], "Riadh El Andalous": [36.8582, 10.1646], "Ben Arous": [36.7531, 10.2189],
  "Mégrine": [36.7708, 10.2336], "Radès": [36.7681, 10.2753], "Ezzahra": [36.7446, 10.3082], "Hammam Lif": [36.7287, 10.3429],
  "Hammam Chott": [36.7177, 10.3775], "Bou Mhel": [36.7281, 10.2972], "Borj Cédria": [36.7022, 10.3957], "El Mourouj": [36.6792, 10.1561],
  "Fouchana": [36.7009, 10.1635], "M'Ghira": [36.6520, 10.0894], "Naâssen": [36.6533, 10.2265], "Manouba": [36.8080, 10.0972],
  "Douar Hicher": [36.8298, 10.0904], "Oued Ellil": [36.8341, 10.0406], "Den Den": [36.8021, 10.1091], "Tébourba": [36.8293, 9.8419],
  "Borj El Amri": [36.7215, 9.8846], "La Marsa": [36.8782, 10.3247], "Le Kram": [36.8334, 10.3163], "Carthage": [36.8528, 10.3233],
  "Sidi Bou Saïd": [36.8702, 10.3417], "Gammarth": [36.9181, 10.2892], "Le Lac": [36.8369, 10.2420], "Ain Zaghouan": [36.8562, 10.2794],
  "Bhar Lazreg": [36.8976, 10.3234], "Nabeul": [36.4513, 10.7359], "Hammamet": [36.4000, 10.6167], "Korba": [36.5786, 10.8586],
  "Grombalia": [36.6075, 10.4986], "Bizerte": [37.2744, 9.8739], "Sousse": [35.8256, 10.6370], "Monastir": [35.7643, 10.8113],
  "Mahdia": [35.5047, 11.0622], "Kairouan": [35.6781, 10.0963], "Sfax centre": [34.7406, 10.7603],
  "Sidi Mansour (secteurs nord)|Sfax Nord": [34.8028, 10.8629], "Gabès": [33.8815, 10.0982],
  "Médenine": [33.3549, 10.5055], "Gafsa": [34.4250, 8.7842], "Tozeur": [33.9197, 8.1335],
  "Menzel Temime|Menzel Temime": [36.78071, 10.99391],
  "Menzel Bourguiba|Bizerte": [37.15499, 9.79259], "Mateur|Bizerte": [37.03860, 9.66770],
  "Menzel Abderrahmen|Bizerte": [37.23706, 9.86272],
  "Sousse Médina|Sousse Ville": [35.83618, 10.63237], "Sousse Jawhara|Sousse Ville": [35.82786, 10.61206],
  "Hammam Sousse|Sousse Nord": [35.87498, 10.59352], "Akouda|Sousse Nord": [35.90524, 10.56207],
  "Hergla|Sousse Nord": [36.03172, 10.50648],
  "Jemmal|Monastir": [35.62393, 10.75924], "Moknine|Monastir": [35.62826, 10.90013],
  "Ksar Hellal|Monastir": [35.64439, 10.88914],
  "El Jem|Mahdia": [35.29664, 10.71284], "Ksour Essef|Mahdia": [35.41628, 10.99872],
  "Chebba|Mahdia": [35.23655, 11.11297], "Agareb|Sfax Sud": [34.74211, 10.52740],
  "Ghannouch|Gabès": [33.93982, 10.06503], "Oudhref|Gabès": [33.98405, 9.96771],
};

// Localités habitées complémentaires issues de l'export Tunisie de GeoNames
// (TN.zip du 9 février 2026, CC BY 4.0), conservées uniquement lorsqu'aucun
// point existant ne se trouve à proximité.
const supplementalLocalities = [
  { name: "Msaken", lat: 35.72917, lng: 10.58082, admin1: "23" },
  { name: "El Mgarsa", lat: 33.81682, lng: 10.9923, admin1: "28" },
  { name: "Soliman", lat: 36.69639, lng: 10.49167, admin1: "19" },
  { name: "Jedeïda", lat: 36.83111, lng: 9.92417, admin1: "39" },
  { name: "Takelsa", lat: 36.78333, lng: 10.63333, admin1: "19" },
  { name: "Ouerdanine", lat: 35.69006, lng: 10.67598, admin1: "16" },
  { name: "La Mornaghia", lat: 36.75898, lng: 10.01704, admin1: "39" },
  { name: "Bekalta", lat: 35.61739, lng: 10.99466, admin1: "16" },
  { name: "Maatmeur", lat: 35.75167, lng: 10.69083, admin1: "16" },
  { name: "Menzel Bouzelfa", lat: 36.68312, lng: 10.58431, admin1: "19" },
  { name: "Kalaat El Andalous", lat: 37.0629, lng: 10.11829, admin1: "38" },
  { name: "Bembla et Mnara", lat: 35.6991, lng: 10.7952, admin1: "16" },
  { name: "Kellabine", lat: 34.70882, lng: 11.2147, admin1: "32" },
  { name: "Beni Khalled", lat: 36.65038, lng: 10.59004, admin1: "19" },
  { name: "Ksibet El Mediouni", lat: 35.68561, lng: 10.84256, admin1: "16" },
  { name: "Messadine", lat: 35.76444, lng: 10.59694, admin1: "23" },
  { name: "Menzel Hayet", lat: 35.54206, lng: 10.57436, admin1: "16" },
  { name: "M'dhilla", lat: 34.25101, lng: 8.74704, admin1: "30" },
  { name: "Bou Arkoub", lat: 36.53853, lng: 10.55093, admin1: "19" },
  { name: "As Sars", lat: 36.0764, lng: 9.02117, admin1: "14" },
  { name: "Zriba Village", lat: 36.34265, lng: 10.24905, admin1: "37" },
  { name: "Sidi Tabet", lat: 36.9099, lng: 10.04222, admin1: "38" },
  { name: "Sidi Bou Ali", lat: 35.95667, lng: 10.47306, admin1: "23" },
  { name: "Al Matlin", lat: 37.24516, lng: 10.05, admin1: "18" },
  { name: "Jerissa", lat: 35.84509, lng: 8.63028, admin1: "14" },
  { name: "Sened", lat: 34.4628, lng: 9.26404, admin1: "30" },
  { name: "Ben Aoun", lat: 34.85261, lng: 9.14391, admin1: "33" },
  { name: "Beni Hassane", lat: 35.5672, lng: 10.80869, admin1: "16" },
  { name: "Menzel Kamel", lat: 35.62477, lng: 10.66727, admin1: "16" },
  { name: "Kalaat Es Senam", lat: 35.76819, lng: 8.34234, admin1: "14" },
  { name: "Amiret Hajjaj", lat: 35.50128, lng: 10.82032, admin1: "16" },
  { name: "El Maamoura", lat: 36.46499, lng: 10.80612, admin1: "19" },
  { name: "Sbikha", lat: 35.93325, lng: 10.02081, admin1: "03" },
  { name: "Ksar El Ababsa", lat: 33.15, lng: 10.36667, admin1: "34" },
  { name: "El Golaa", lat: 33.48485, lng: 9.00678, admin1: "31" },
  { name: "Le Krib", lat: 36.32802, lng: 9.13613, admin1: "22" },
  { name: "Sidi Amor Bou Hajela", lat: 35.39742, lng: 10.0477, admin1: "03" },
  { name: "Dar Ouled Khalifa", lat: 35.35, lng: 8.61667, admin1: "02" },
  { name: "Hencha", lat: 35.12226, lng: 10.74219, admin1: "32" },
  { name: "Djebibina", lat: 36.11667, lng: 10.1, admin1: "37" },
  { name: "Nouvelle Matmata", lat: 33.63, lng: 10.06, admin1: "29" },
  { name: "Kerker", lat: 35.4816, lng: 10.64215, admin1: "15" },
  { name: "El Bahira", lat: 35.33333, lng: 11, admin1: "15" },
  { name: "Mezzouna", lat: 34.57758, lng: 9.84193, admin1: "33" },
  { name: "Djebel Abiod", lat: 36.97616, lng: 9.07845, admin1: "17" },
  { name: "Jemna", lat: 33.57778, lng: 9.01472, admin1: "31" },
  { name: "Djebeniana", lat: 35.035, lng: 10.90809, admin1: "32" },
  { name: "Menzel Bouzaiane", lat: 34.5732, lng: 9.42567, admin1: "33" },
  { name: "Es Somaa", lat: 36.54364, lng: 10.78065, admin1: "19" },
  { name: "Melloulèche", lat: 35.16617, lng: 11.03504, admin1: "15" },
  { name: "Thelepte", lat: 34.97776, lng: 8.59264, admin1: "02" },
  { name: "Sbiba", lat: 35.54332, lng: 9.0737, admin1: "02" },
  { name: "Bir El Hafey", lat: 34.93212, lng: 9.19321, admin1: "33" },
  { name: "Borj Mejen Bel Abbès", lat: 34.7501, lng: 8.51976, admin1: "02" },
  { name: "El Hamma Djerid", lat: 34.01152, lng: 8.15308, admin1: "35" },
  { name: "Remada", lat: 32.31662, lng: 10.39551, admin1: "34" },
  { name: "Amiret Touazra", lat: 35.48639, lng: 10.76283, admin1: "16" },
  { name: "Sejenane", lat: 37.05722, lng: 9.23806, admin1: "18" },
  { name: "Chorbane", lat: 35.28581, lng: 10.3858, admin1: "15" },
  { name: "Zarat", lat: 33.66655, lng: 10.34896, admin1: "29" },
  { name: "El Ksour", lat: 35.89607, lng: 8.88493, admin1: "14" },
  { name: "Souassi", lat: 35.34325, lng: 10.54745, admin1: "15" },
  { name: "Cheylus", lat: 36.55722, lng: 10.06, admin1: "37" },
  { name: "Amiret El Fhoul", lat: 35.44446, lng: 10.82765, admin1: "16" },
  { name: "Aousja", lat: 37.1413, lng: 10.10174, admin1: "18" },
  { name: "Chehimet Nord", lat: 35.43405, lng: 10.39448, admin1: "15" },
  { name: "Dar Ali Ben Hassene", lat: 35.5, lng: 10.7, admin1: "16" },
  { name: "Zaouiet Azmour", lat: 36.92441, lng: 11.0078, admin1: "19" },
];

const supplementalDistrictsByAdmin1 = {
  "02": ["Kasserine"], "03": ["Kairouan"], "06": ["Jendouba"], "14": ["Le Kef"],
  "15": ["Mahdia"], "16": ["Monastir"], "17": ["Béja"], "18": ["Bizerte"],
  "19": ["Nabeul", "Menzel Temime"], "22": ["Siliana"], "23": ["Sousse Ville", "Sousse Nord"],
  "27": ["Ben Arous", "El Mourouj"], "28": ["Médenine", "Djerba"], "29": ["Gabès"],
  "30": ["Gafsa"], "31": ["Kébili"], "32": ["Sfax Ville", "Sfax Nord", "Sfax Sud"],
  "33": ["Sidi Bouzid"], "34": ["Tataouine"], "35": ["Tozeur"],
  "36": ["Tunis Ville", "La Marsa / Kram"], "37": ["Zaghouan"], "38": ["Ariana"], "39": ["Manouba"],
};

function slugifySteg(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function offsetCoord(center, index) {
  const ring = Math.floor(index / 8) + 1;
  const angle = (index % 8) * Math.PI / 4;
  return [center[0] + Math.sin(angle) * 0.035 * ring, center[1] + Math.cos(angle) * 0.045 * ring];
}

function nearestSupplementalDistrict(locality) {
  const candidates = supplementalDistrictsByAdmin1[locality.admin1] || Object.keys(districtCenters);
  return candidates.reduce((nearest, district) => {
    const center = districtCenters[district];
    const distance = Math.hypot(locality.lat - center[0], (locality.lng - center[1]) * Math.cos(locality.lat * Math.PI / 180));
    return !nearest || distance < nearest.distance ? { district, distance } : nearest;
  }, null).district;
}

window.stegTerritory = stegTerritory;
const baseStegZones = stegTerritory.flatMap((directionEntry) => directionEntry.districts.flatMap((districtEntry) => {
  const center = districtCenters[districtEntry.district] || [34.85, 9.55];
  return districtEntry.zones.map((zoneName, index) => {
    const coord = exactCoords[`${zoneName}|${districtEntry.district}`] || exactCoords[zoneName] || offsetCoord(center, index);
    const seed = slugifySteg(`${districtEntry.district}-${zoneName}`).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const reports = 8 + (seed % 86);
    return {
      id: slugifySteg(`${districtEntry.district}-${zoneName}`),
      city: zoneName,
      governorate: districtEntry.district,
      direction: directionEntry.direction,
      agencies: districtEntry.agencies,
      lat: Number(coord[0].toFixed(5)),
      lng: Number(coord[1].toFixed(5)),
      reports,
      status: reports > 68 ? "confirmed" : reports < 22 ? "resolved" : "probable",
      trust: 62 + (seed % 35),
    };
  });
}));

const districtMetadata = new Map(stegTerritory.flatMap((directionEntry) => directionEntry.districts.map((districtEntry) => [
  districtEntry.district,
  { direction: directionEntry.direction, agencies: districtEntry.agencies },
])));

const supplementalStegZones = supplementalLocalities.map((locality) => {
  const district = nearestSupplementalDistrict(locality);
  const metadata = districtMetadata.get(district);
  const seed = slugifySteg(`${district}-${locality.name}`).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const reports = 8 + (seed % 86);
  return {
    id: slugifySteg(`${district}-${locality.name}`),
    city: locality.name,
    governorate: district,
    direction: metadata.direction,
    agencies: metadata.agencies,
    lat: locality.lat,
    lng: locality.lng,
    reports,
    status: reports > 68 ? "confirmed" : reports < 22 ? "resolved" : "probable",
    trust: 62 + (seed % 35),
    source: "geonames",
  };
});

window.stegZones = [...baseStegZones, ...supplementalStegZones];
