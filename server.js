const express = require('express');
const app = express();
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// PORT (Dla Rendera i lokalnie)
const PORT = process.env.PORT || 3000;

// Konfiguracja EJS i folderów
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.urlencoded({ extended: true }));

// Konfiguracja Sesji (Logowanie)
app.use(session({
    secret: 'tajnehaslo123',
    resave: false,
    saveUninitialized: true
}));

// Konfiguracja Multer (Zdjęcia)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Upewnij się, że folder istnieje
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads');
        }
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Pliki danych
const DATA_FILE = 'baza.json';
const LOGS_FILE = 'logi.txt';

// --- FUNKCJE POMOCNICZE ---

function wczytajPlik(sciezka) {
    if (!fs.existsSync(sciezka)) return [];
    const data = fs.readFileSync(sciezka);
    if (!data.toString()) return []; // Pusty plik
    return JSON.parse(data);
}

function zapiszPlik(sciezka, dane) {
    fs.writeFileSync(sciezka, JSON.stringify(dane, null, 2));
}

function logujAkcje(akcja, opis) {
    const data = new Date().toLocaleString();
    const wpis = `[${data}] [${akcja}] ${opis}\n`;
    fs.appendFileSync(LOGS_FILE, wpis);
}

// Middleware: Sprawdzanie czy zalogowany
function wymaganeLogowanie(req, res, next) {
    if (req.session.zalogowany) {
        next();
    } else {
        res.redirect('/login');
    }
}

// --- TRASY (ROUTES) ---

// 1. Ekran Logowania
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const haslo = req.body.haslo;
    if (haslo === 'wojsko123') { // Tu wpisz swoje hasło
        req.session.zalogowany = true;
        res.redirect('/');
    } else {
        res.render('login', { error: 'Nieprawidłowe hasło!' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// 2. Strona Główna (Magazyn)
app.get('/', wymaganeLogowanie, (req, res) => {
    const arsenal = wczytajPlik(DATA_FILE);
    res.render('index', { arsenal: arsenal });
});

// 3. Dodawanie Sprzętu (z kategorią)
app.post('/dodaj', wymaganeLogowanie, upload.single('zdjecie'), (req, res) => {
    const arsenal = wczytajPlik(DATA_FILE);
    const nowySprzet = {
        id: Date.now(),
        nazwa: req.body.nazwa,
        kategoria: req.body.kategoria || "Inne",
        opis: req.body.opis,
        ilosc: parseInt(req.body.ilosc),
        obrazek: req.file ? '/uploads/' + req.file.filename : null 
    };
    arsenal.push(nowySprzet);
    zapiszPlik(DATA_FILE, arsenal);
    logujAkcje("DOSTAWA", `Dodano: ${req.body.nazwa} [${nowySprzet.kategoria}]`);
    res.redirect('/');
});

// 4. Usuwanie
app.post('/usun/:id', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.params.id);
    const usuniety = arsenal.find(item => item.id === id);
    
    arsenal = arsenal.filter(item => item.id !== id);
    zapiszPlik(DATA_FILE, arsenal);
    
    if(usuniety) logujAkcje("USUNIĘCIE", `Usunięto: ${usuniety.nazwa}`);
    res.redirect('/');
});

// 5. Zmiana Ilości (+/-)
app.post('/zmien/:id/:akcja', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.params.id);
    const akcja = req.params.akcja;
    
    const index = arsenal.findIndex(item => item.id === id);
    if (index !== -1) {
        if (akcja === 'plus') {
            arsenal[index].ilosc++;
            logujAkcje("KOREKTA", `Zwiększono stan: ${arsenal[index].nazwa}`);
        } else if (akcja === 'minus' && arsenal[index].ilosc > 0) {
            arsenal[index].ilosc--;
            logujAkcje("KOREKTA", `Zmniejszono stan: ${arsenal[index].nazwa}`);
        }
        zapiszPlik(DATA_FILE, arsenal);
    }
    res.redirect('/');
});

// 6. Edycja (z kategorią)
app.post('/edytuj', wymaganeLogowanie, upload.single('zdjecie'), (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.body.id);
    const index = arsenal.findIndex(item => item.id === id);

    if (index !== -1) {
        arsenal[index].nazwa = req.body.nazwa;
        arsenal[index].kategoria = req.body.kategoria;
        arsenal[index].opis = req.body.opis;
        arsenal[index].ilosc = parseInt(req.body.ilosc);
        
        if (req.file) {
            arsenal[index].obrazek = '/uploads/' + req.file.filename;
        }

        zapiszPlik(DATA_FILE, arsenal);
        logujAkcje("EDYCJA", `Zaktualizowano: ${req.body.nazwa}`);
    }
    res.redirect('/');
});

// 7. Wydawanie Sprzętu (NOWOŚĆ)
app.post('/wydaj', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.body.id);
    const iloscDoWydania = parseInt(req.body.ilosc);
    const odbiorca = req.body.odbiorca;
    const cel = req.body.cel;

    const index = arsenal.findIndex(item => item.id === id);

    if (index !== -1) {
        if (arsenal[index].ilosc >= iloscDoWydania) {
            arsenal[index].ilosc -= iloscDoWydania;
            zapiszPlik(DATA_FILE, arsenal);
            logujAkcje("WYDANIE", `Wydano: ${iloscDoWydania}szt. ${arsenal[index].nazwa} | Odbiorca: ${odbiorca} | Cel: ${cel}`);
        } else {
            console.log("BRAK TOWARU NA STANIE!"); 
        }
    }
    res.redirect('/');
});

// 8. Strona Historii (Logi)
app.get('/historia', wymaganeLogowanie, (req, res) => {
    let logi = [];
    if (fs.existsSync(LOGS_FILE)) {
        const data = fs.readFileSync(LOGS_FILE, 'utf8');
        logi = data.split('\n').filter(line => line.length > 0).reverse();
    }
    res.render('historia', { logi: logi });
});

// START SERWERA
app.listen(PORT, () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});