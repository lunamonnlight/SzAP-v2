const express = require('express');
const session = require('express-session');
const fs = require('fs');
const multer = require('multer'); // <--- NOWOŚĆ
const path = require('path');     // <--- Do obsługi ścieżek plików
const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = 'baza.json';
const LOG_FILE = 'historia.json';

// --- KONFIGURACJA PRZESYŁANIA ZDJĘĆ ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // Gdzie zapisać
    },
    filename: function (req, file, cb) {
        // Generujemy unikalną nazwę: data + oryginalna nazwa (np. 170988_czolg.jpg)
        cb(null, Date.now() + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
// Ważne: Udostępniamy folder uploads publicznie, żeby przeglądarka widziała zdjęcia
app.use('/uploads', express.static('uploads')); 
app.use(express.static('public'));
app.use(session({
    secret: 'super_tajne_haslo_szap_v2',
    resave: false,
    saveUninitialized: false
}));

const ADMIN_USER = "admin";
const ADMIN_PASS = "1234";

// --- FUNKCJE POMOCNICZE ---
function wczytajPlik(plik) {
    try { return JSON.parse(fs.readFileSync(plik, 'utf8')); } catch (e) { return []; }
}
function zapiszPlik(plik, dane) {
    fs.writeFileSync(plik, JSON.stringify(dane, null, 2), 'utf8');
}
function logujAkcje(typ, opis) {
    const logi = wczytajPlik(LOG_FILE);
    logi.unshift({ data: new Date().toLocaleString(), typ: typ, opis: opis });
    zapiszPlik(LOG_FILE, logi);
}
function wymaganeLogowanie(req, res, next) {
    if (req.session.zalogowany) next(); else res.redirect('/login');
}

// --- ROUTE'Y ---

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
    if (req.body.login === ADMIN_USER && req.body.haslo === ADMIN_PASS) {
        req.session.zalogowany = true; res.redirect('/');
    } else res.render('login', { error: "Błąd!" });
});
app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/', wymaganeLogowanie, (req, res) => {
    res.render('index', { arsenal: wczytajPlik(DATA_FILE) });
});
app.get('/historia', wymaganeLogowanie, (req, res) => {
    res.render('historia', { logi: wczytajPlik(LOG_FILE) });
});

// --- DODAWANIE ZE ZDJĘCIEM ---
// 'upload.single("zdjecie")' oznacza, że czekamy na jeden plik z pola o nazwie "zdjecie"
app.post('/dodaj', wymaganeLogowanie, upload.single('zdjecie'), (req, res) => {
    const arsenal = wczytajPlik(DATA_FILE);
    
    const nowySprzet = {
        id: Date.now(),
        nazwa: req.body.nazwa,
        opis: req.body.opis,
        ilosc: parseInt(req.body.ilosc),
        // Jeśli plik został przesłany, zapisujemy jego ścieżkę. Jeśli nie - null.
        obrazek: req.file ? '/uploads/' + req.file.filename : null 
    };
    
    arsenal.push(nowySprzet);
    zapiszPlik(DATA_FILE, arsenal);
    logujAkcje("DOSTAWA", `Dodano: ${req.body.nazwa} (FOTO: ${req.file ? 'TAK' : 'NIE'})`);
    res.redirect('/');
});

// --- EDYCJA ZE ZDJĘCIEM ---
app.post('/edytuj', wymaganeLogowanie, upload.single('zdjecie'), (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.body.id);
    const index = arsenal.findIndex(item => item.id === id);

    if (index !== -1) {
        arsenal[index].nazwa = req.body.nazwa;
        arsenal[index].opis = req.body.opis;
        arsenal[index].ilosc = parseInt(req.body.ilosc);
        
        // Jeśli użytkownik wgrał nowe zdjęcie, podmieniamy je. 
        // Jeśli nie wgrał nic, zostawiamy stare.
        if (req.file) {
            arsenal[index].obrazek = '/uploads/' + req.file.filename;
        }

        zapiszPlik(DATA_FILE, arsenal);
        logujAkcje("KOREKTA", `Edycja wpisu: ${req.body.nazwa}`);
    }
    res.redirect('/');
});

// Pozostałe funkcje bez zmian
app.post('/usun/:id', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.params.id);
    arsenal = arsenal.filter(item => item.id !== id);
    zapiszPlik(DATA_FILE, arsenal);
    logujAkcje("LIKWIDACJA", `Usunięto ID: ${id}`);
    res.redirect('/');
});

app.post('/zmien/:id/:akcja', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const item = arsenal.find(i => i.id === parseInt(req.params.id));
    if (item) {
        if (req.params.akcja === 'plus') item.ilosc++;
        else if (req.params.akcja === 'minus' && item.ilosc > 0) item.ilosc--;
        zapiszPlik(DATA_FILE, arsenal);
    }
    res.redirect('/');
});

app.listen(PORT, () => console.log(`📸 SzAP v2 z Obsługą FOTO działa na porcie ${PORT}`));