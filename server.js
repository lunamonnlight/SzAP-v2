const express = require('express');
const app = express();
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const PORT = process.env.PORT || 3000;

// Konfiguracja
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

// Multer (Zdjęcia)
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

// PLIKI DANYCH
const DATA_FILE = 'baza.json';
const LOGS_FILE = 'logi.txt';
const USERS_FILE = 'uzytkownicy.json'; // <--- NOWOŚĆ

// --- FUNKCJE POMOCNICZE ---

function wczytajPlik(sciezka) {
    if (!fs.existsSync(sciezka)) return [];
    const data = fs.readFileSync(sciezka);
    if (!data.toString()) return [];
    return JSON.parse(data);
}

function zapiszPlik(sciezka, dane) {
    fs.writeFileSync(sciezka, JSON.stringify(dane, null, 2));
}

function logujAkcje(akcja, opis, user = "System") {
    const data = new Date().toLocaleString();
    fs.appendFileSync(LOGS_FILE, `[${data}] [${akcja}] [${user}] ${opis}\n`);
}

// Middleware logowania (z przekazywaniem usera do widoku)
function wymaganeLogowanie(req, res, next) {
    if (req.session.zalogowany) {
        res.locals.user = req.session.user; // Dostępne w każdym widoku
        next();
    } else {
        res.redirect('/login');
    }
}

// Middleware: Tylko Administrator
function wymaganyAdmin(req, res, next) {
    if (req.session.user && req.session.user.rola === 'Administrator') {
        next();
    } else {
        res.status(403).send("Brak uprawnień. Wymagana rola: Administrator.");
    }
}

// --- TRASY (ROUTES) ---

// 1. Logowanie (NOWE - Z PLIKU)
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const users = wczytajPlik(USERS_FILE);
    const { login, haslo } = req.body;
    
    // Szukamy użytkownika
    const user = users.find(u => u.login === login && u.haslo === haslo);

    if (user) {
        req.session.zalogowany = true;
        req.session.user = user; // Zapamiętujemy kto to
        logujAkcje("LOGIN", "Zalogowano do systemu", user.login);
        res.redirect('/');
    } else {
        res.render('login', { error: 'Błędny login lub hasło!' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// 2. Magazyn
app.get('/', wymaganeLogowanie, (req, res) => {
    const arsenal = wczytajPlik(DATA_FILE);
    res.render('index', { arsenal: arsenal });
});

// 3. Historia
app.get('/historia', wymaganeLogowanie, (req, res) => {
    let logi = fs.existsSync(LOGS_FILE) ? fs.readFileSync(LOGS_FILE, 'utf8').split('\n').filter(l => l).reverse() : [];
    res.render('historia', { logi: logi });
});

// 4. ZARZĄDZANIE UŻYTKOWNIKAMI (NOWOŚĆ - ZGODNIE Z DOKUMENTACJĄ)
app.get('/uzytkownicy', wymaganeLogowanie, wymaganyAdmin, (req, res) => {
    const users = wczytajPlik(USERS_FILE);
    res.render('uzytkownicy', { users: users });
});

app.post('/uzytkownicy/dodaj', wymaganeLogowanie, wymaganyAdmin, (req, res) => {
    const users = wczytajPlik(USERS_FILE);
    
    const newUser = {
        id: Date.now(),
        login: req.body.login,
        haslo: req.body.haslo, // W produkcji powinno być hashowane!
        imie: req.body.imie,
        nazwisko: req.body.nazwisko,
        rola: req.body.rola,
        jednostka: req.body.jednostka
    };
    
    users.push(newUser);
    zapiszPlik(USERS_FILE, users);
    logujAkcje("ADMIN", `Utworzono użytkownika: ${newUser.login} (${newUser.rola})`, req.session.user.login);
    res.redirect('/uzytkownicy');
});

app.post('/uzytkownicy/usun/:id', wymaganeLogowanie, wymaganyAdmin, (req, res) => {
    let users = wczytajPlik(USERS_FILE);
    const id = parseInt(req.params.id);
    
    // Nie pozwól usunąć samego siebie
    if (id === req.session.user.id) {
        return res.send("Nie możesz usunąć własnego konta!");
    }

    users = users.filter(u => u.id !== id);
    zapiszPlik(USERS_FILE, users);
    logujAkcje("ADMIN", `Usunięto użytkownika ID: ${id}`, req.session.user.login);
    res.redirect('/uzytkownicy');
});

// --- BACKUP SYSTEMU (Zgodne z SYS-UC14) ---
app.post('/admin/backup', wymaganeLogowanie, wymaganyAdmin, (req, res) => {
    // 1. Tworzymy folder backups jeśli nie istnieje
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    // 2. Generujemy unikalną nazwę z datą (np. 2025-01-13-12-00-00)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    try {
        // 3. Kopiujemy kluczowe pliki
        if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, path.join(backupDir, `baza-${timestamp}.json`));
        if (fs.existsSync(USERS_FILE)) fs.copyFileSync(USERS_FILE, path.join(backupDir, `uzytkownicy-${timestamp}.json`));
        if (fs.existsSync(LOGS_FILE)) fs.copyFileSync(LOGS_FILE, path.join(backupDir, `logi-${timestamp}.txt`));

        logujAkcje("BACKUP", `Wykonano pełny backup systemu: backup-${timestamp}`, req.session.user.login);
        console.log("Backup wykonany!");
    } catch (err) {
        console.error("Błąd backupu:", err);
        logujAkcje("BŁĄD", `Nieudany backup: ${err.message}`, req.session.user.login);
    }
    
    // Wracamy do panelu
    res.redirect('/uzytkownicy');
});

// --- OBSŁUGA SPRZĘTU (BEZ ZMIAN W LOGICE, ALE Z LOGOWANIEM UŻYTKOWNIKA) ---

app.post('/dodaj', wymaganeLogowanie, upload.single('zdjecie'), (req, res) => {
    const arsenal = wczytajPlik(DATA_FILE);
    const nowySprzet = {
        id: Date.now(),
        nazwa: req.body.nazwa,
        kategoria: req.body.kategoria || "Inne",
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
    logujAkcje("DOSTAWA", `Dodano: ${req.body.nazwa}`, req.session.user.login);
    res.redirect('/');
});

app.post('/edytuj', wymaganeLogowanie, upload.single('zdjecie'), (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.body.id);
    const index = arsenal.findIndex(item => item.id === id);
    if (index !== -1) {
        arsenal[index].nazwa = req.body.nazwa;
        arsenal[index].kategoria = req.body.kategoria;
        arsenal[index].magazyn = req.body.magazyn;
        arsenal[index].kod = req.body.kod;
        arsenal[index].min_ilosc = parseInt(req.body.min_ilosc);
        arsenal[index].cena = parseFloat(req.body.cena);
        arsenal[index].opis = req.body.opis;
        arsenal[index].ilosc = parseInt(req.body.ilosc);
        if (req.file) arsenal[index].obrazek = '/uploads/' + req.file.filename;
        zapiszPlik(DATA_FILE, arsenal);
        logujAkcje("EDYCJA", `Zaktualizowano: ${req.body.nazwa}`, req.session.user.login);
    }
    res.redirect('/');
});

app.post('/usun/:id', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const id = parseInt(req.params.id);
    const usuniety = arsenal.find(i => i.id === id);
    arsenal = arsenal.filter(i => i.id !== id);
    zapiszPlik(DATA_FILE, arsenal);
    if(usuniety) logujAkcje("USUNIĘCIE", `Usunięto: ${usuniety.nazwa}`, req.session.user.login);
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
        logujAkcje("WYDANIE", `Wydano: ${ilosc} szt. ${arsenal[index].nazwa} dla: ${req.body.odbiorca}`, req.session.user.login);
    }
    res.redirect('/');
});

app.listen(PORT, () => console.log(`Serwer startuje na porcie ${PORT}`));