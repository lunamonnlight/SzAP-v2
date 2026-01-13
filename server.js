const express = require('express');
const app = express();
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'tajnehaslo123',
    resave: false,
    saveUninitialized: true
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const DATA_FILE = 'baza.json';
const LOGS_FILE = 'logi.txt';

function wczytajPlik(sciezka) {
    if (!fs.existsSync(sciezka)) return [];
    const data = fs.readFileSync(sciezka);
    if (!data.toString()) return [];
    return JSON.parse(data);
}

function zapiszPlik(sciezka, dane) {
    fs.writeFileSync(sciezka, JSON.stringify(dane, null, 2));
}

function logujAkcje(akcja, opis) {
    const data = new Date().toLocaleString();
    fs.appendFileSync(LOGS_FILE, `[${data}] [${akcja}] ${opis}\n`);
}

function wymaganeLogowanie(req, res, next) {
    if (req.session.zalogowany) next();
    else res.redirect('/login');
}

// --- TRASY ---

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    if (req.body.haslo === 'wojsko123') { // Hasło
        req.session.zalogowany = true;
        res.redirect('/');
    } else {
        res.render('login', { error: 'Błąd autoryzacji' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', wymaganeLogowanie, (req, res) => {
    const arsenal = wczytajPlik(DATA_FILE);
    res.render('index', { arsenal: arsenal });
});

// --- DODAWANIE (Z NOWYMI POLAMI: Magazyn, Kod, Cena, Min) ---
app.post('/dodaj', wymaganeLogowanie, upload.single('zdjecie'), (req, res) => {
    const arsenal = wczytajPlik(DATA_FILE);
    
    const nowySprzet = {
        id: Date.now(),
        nazwa: req.body.nazwa,
        kategoria: req.body.kategoria || "Inne",
        
        // NOWE POLA Z DOKUMENTACJI
        magazyn: req.body.magazyn || "Główny", 
        kod: req.body.kod || "BRAK",
        min_ilosc: parseInt(req.body.min_ilosc) || 0,
        cena: parseFloat(req.body.cena) || 0,

        opis: req.body.opis,
        ilosc: parseInt(req.body.ilosc),
        obrazek: req.file ? '/uploads/' + req.file.filename : null 
    };
    
    arsenal.push(nowySprzet);
    zapiszPlik(DATA_FILE, arsenal);
    logujAkcje("DOSTAWA", `Dodano: ${req.body.nazwa} do magazynu: ${nowySprzet.magazyn}`);
    res.redirect('/');
});

// --- EDYCJA (Z NOWYMI POLAMI) ---
app.post('/edytuj', wymaganeLogowanie, upload.single('zdjecie'), (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.body.id);
    const index = arsenal.findIndex(item => item.id === id);

    if (index !== -1) {
        arsenal[index].nazwa = req.body.nazwa;
        arsenal[index].kategoria = req.body.kategoria;
        arsenal[index].opis = req.body.opis;
        arsenal[index].ilosc = parseInt(req.body.ilosc);
        
        // Aktualizacja nowych pól
        arsenal[index].magazyn = req.body.magazyn;
        arsenal[index].kod = req.body.kod;
        arsenal[index].min_ilosc = parseInt(req.body.min_ilosc);
        arsenal[index].cena = parseFloat(req.body.cena);

        if (req.file) arsenal[index].obrazek = '/uploads/' + req.file.filename;

        zapiszPlik(DATA_FILE, arsenal);
        logujAkcje("EDYCJA", `Zaktualizowano dane: ${req.body.nazwa}`);
    }
    res.redirect('/');
});

app.post('/usun/:id', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.params.id);
    const usuniety = arsenal.find(i => i.id === id);
    arsenal = arsenal.filter(i => i.id !== id);
    zapiszPlik(DATA_FILE, arsenal);
    if(usuniety) logujAkcje("USUNIĘCIE", `Usunięto: ${usuniety.nazwa}`);
    res.redirect('/');
});

app.post('/zmien/:id/:akcja', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.params.id);
    const index = arsenal.findIndex(i => i.id === id);
    if (index !== -1) {
        if (req.params.akcja === 'plus') arsenal[index].ilosc++;
        else if (req.params.akcja === 'minus' && arsenal[index].ilosc > 0) arsenal[index].ilosc--;
        zapiszPlik(DATA_FILE, arsenal);
    }
    res.redirect('/');
});

app.post('/wydaj', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.body.id);
    const ilosc = parseInt(req.body.ilosc);
    const index = arsenal.findIndex(i => i.id === id);

    if (index !== -1 && arsenal[index].ilosc >= ilosc) {
        arsenal[index].ilosc -= ilosc;
        zapiszPlik(DATA_FILE, arsenal);
        logujAkcje("WYDANIE", `Wydano: ${ilosc} szt. ${arsenal[index].nazwa} dla: ${req.body.odbiorca} (Cel: ${req.body.cel})`);
    }
    res.redirect('/');
});

app.get('/historia', wymaganeLogowanie, (req, res) => {
    let logi = fs.existsSync(LOGS_FILE) ? fs.readFileSync(LOGS_FILE, 'utf8').split('\n').filter(l => l).reverse() : [];
    res.render('historia', { logi: logi });
});

app.listen(PORT, () => console.log(`Serwer startuje na porcie ${PORT}`));