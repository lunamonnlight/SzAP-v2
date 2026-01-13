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

// PLIKI DANYCH
const DATA_FILE = 'baza.json';
const LOGS_FILE = 'logi.txt';
const USERS_FILE = 'uzytkownicy.json';
const SUPPLIERS_FILE = 'dostawcy.json';   // NOWE
const ORDERS_FILE = 'zamowienia.json';    // NOWE

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

function wymaganeLogowanie(req, res, next) {
    if (req.session.zalogowany) {
        res.locals.user = req.session.user;
        next();
    } else {
        res.redirect('/login');
    }
}

function wymaganyAdmin(req, res, next) {
    if (req.session.user && req.session.user.rola === 'Administrator') {
        next();
    } else {
        res.status(403).send("Brak uprawnień. Wymagana rola: Administrator.");
    }
}

// --- TRASY ---

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const users = wczytajPlik(USERS_FILE);
    const { login, haslo } = req.body;
    const user = users.find(u => u.login === login && u.haslo === haslo);

    if (user) {
        req.session.zalogowany = true;
        req.session.user = user;
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

app.get('/', wymaganeLogowanie, (req, res) => {
    const arsenal = wczytajPlik(DATA_FILE);
    res.render('index', { arsenal: arsenal });
});

app.get('/historia', wymaganeLogowanie, (req, res) => {
    let logi = fs.existsSync(LOGS_FILE) ? fs.readFileSync(LOGS_FILE, 'utf8').split('\n').filter(l => l).reverse() : [];
    res.render('historia', { logi: logi });
});

app.get('/uzytkownicy', wymaganeLogowanie, wymaganyAdmin, (req, res) => {
    const users = wczytajPlik(USERS_FILE);
    res.render('uzytkownicy', { users: users });
});

app.post('/uzytkownicy/dodaj', wymaganeLogowanie, wymaganyAdmin, (req, res) => {
    const users = wczytajPlik(USERS_FILE);
    const newUser = { id: Date.now(), ...req.body };
    users.push(newUser);
    zapiszPlik(USERS_FILE, users);
    logujAkcje("ADMIN", `Dodano usera: ${newUser.login}`, req.session.user.login);
    res.redirect('/uzytkownicy');
});

app.post('/uzytkownicy/usun/:id', wymaganeLogowanie, wymaganyAdmin, (req, res) => {
    let users = wczytajPlik(USERS_FILE);
    const id = parseInt(req.params.id);
    if (id === req.session.user.id) return res.send("Nie możesz usunąć siebie!");
    users = users.filter(u => u.id !== id);
    zapiszPlik(USERS_FILE, users);
    logujAkcje("ADMIN", `Usunięto usera ID: ${id}`, req.session.user.login);
    res.redirect('/uzytkownicy');
});

app.post('/admin/backup', wymaganeLogowanie, wymaganyAdmin, (req, res) => {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    try {
        if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, path.join(backupDir, `baza-${timestamp}.json`));
        if (fs.existsSync(USERS_FILE)) fs.copyFileSync(USERS_FILE, path.join(backupDir, `uzytkownicy-${timestamp}.json`));
        if (fs.existsSync(LOGS_FILE)) fs.copyFileSync(LOGS_FILE, path.join(backupDir, `logi-${timestamp}.txt`));
        if (fs.existsSync(SUPPLIERS_FILE)) fs.copyFileSync(SUPPLIERS_FILE, path.join(backupDir, `dostawcy-${timestamp}.json`)); // Backup dostawców
        
        logujAkcje("BACKUP", `Wykonano backup: backup-${timestamp}`, req.session.user.login);
    } catch (err) {
        logujAkcje("BŁĄD", `Błąd backupu: ${err.message}`, req.session.user.login);
    }
    res.redirect('/uzytkownicy');
});

app.get('/statystyki', wymaganeLogowanie, (req, res) => {
    const arsenal = wczytajPlik(DATA_FILE);
    let calkowitaWartosc = 0;
    let liczbaAlertow = 0;
    let lacznaIlosc = 0;
    let kategorie = {};

    arsenal.forEach(item => {
        if(item.cena && item.ilosc) calkowitaWartosc += (item.cena * item.ilosc);
        lacznaIlosc += item.ilosc;
        if (item.min_ilosc && item.ilosc < item.min_ilosc) liczbaAlertow++;
        const kat = item.kategoria || "Inne";
        if (!kategorie[kat]) kategorie[kat] = 0;
        kategorie[kat] += item.ilosc;
    });

    res.render('statystyki', { 
        arsenal: arsenal,
        stats: { wartosc: calkowitaWartosc.toFixed(2), alerty: liczbaAlertow, ilosc: lacznaIlosc, kategorie: kategorie }
    });
});

// --- NOWOŚĆ: LOGISTYKA (ZAMÓWIENIA) ---

app.get('/zamowienia', wymaganeLogowanie, (req, res) => {
    const arsenal = wczytajPlik(DATA_FILE);
    const dostawcy = wczytajPlik(SUPPLIERS_FILE);
    const zamowienia = wczytajPlik(ORDERS_FILE).reverse(); // Najnowsze na górze
    
    // Filtrujemy tylko to, co ma niski stan, żeby ułatwić życie logistykowi
    const braki = arsenal.filter(item => item.min_ilosc && item.ilosc < item.min_ilosc);

    res.render('zamowienia', { 
        arsenal: arsenal,
        braki: braki,
        dostawcy: dostawcy,
        zamowienia: zamowienia
    });
});

app.post('/dostawcy/dodaj', wymaganeLogowanie, (req, res) => {
    const dostawcy = wczytajPlik(SUPPLIERS_FILE);
    const nowy = { id: Date.now(), ...req.body };
    dostawcy.push(nowy);
    zapiszPlik(SUPPLIERS_FILE, dostawcy);
    logujAkcje("LOGISTYKA", `Dodano dostawcę: ${nowy.nazwa}`, req.session.user.login);
    res.redirect('/zamowienia');
});

app.post('/zamowienia/nowe', wymaganeLogowanie, (req, res) => {
    const zamowienia = wczytajPlik(ORDERS_FILE);
    const dostawcy = wczytajPlik(SUPPLIERS_FILE);
    
    // Parsowanie danych z formularza
    // Req.body będzie zawierać: { dostawca: ID, 'item_12345': '500', 'item_67890': '200' ... }
    
    let pozycje = [];
    let suma = 0;
    const arsenal = wczytajPlik(DATA_FILE);

    // Przelatujemy przez klucze formularza, szukamy tych zaczynających się od 'item_'
    for (const key in req.body) {
        if (key.startsWith('item_') && req.body[key] > 0) {
            const itemId = parseInt(key.split('_')[1]);
            const ilosc = parseInt(req.body[key]);
            
            const produkt = arsenal.find(i => i.id === itemId);
            if (produkt) {
                const wartosc = ilosc * (produkt.cena || 0);
                suma += wartosc;
                pozycje.push({
                    nazwa: produkt.nazwa,
                    kod: produkt.kod,
                    ilosc: ilosc,
                    cena_jedn: produkt.cena || 0,
                    wartosc: wartosc
                });
            }
        }
    }

    if (pozycje.length > 0) {
        const wybranyDostawca = dostawcy.find(d => d.id == req.body.dostawcaId);
        
        const noweZamowienie = {
            id: "ZM-" + Date.now().toString().slice(-6), // np. ZM-123456
            data: new Date().toLocaleDateString(),
            dostawca: wybranyDostawca,
            pozycje: pozycje,
            suma: suma,
            status: "WYSŁANO",
            wystawil: req.session.user.login
        };

        zamowienia.push(noweZamowienie);
        zapiszPlik(ORDERS_FILE, zamowienia);
        logujAkcje("LOGISTYKA", `Utworzono zamówienie: ${noweZamowienie.id} na kwotę ${suma} PLN`, req.session.user.login);
    }

    res.redirect('/zamowienia');
});

// --- STARE TRASY CRUD ---
app.post('/dodaj', wymaganeLogowanie, upload.single('zdjecie'), (req, res) => {
    const arsenal = wczytajPlik(DATA_FILE);
    const nowy = { id: Date.now(), ...req.body, ilosc: parseInt(req.body.ilosc), cena: parseFloat(req.body.cena), min_ilosc: parseInt(req.body.min_ilosc), obrazek: req.file ? '/uploads/' + req.file.filename : null, kategoria: req.body.kategoria || "Inne" };
    arsenal.push(nowy);
    zapiszPlik(DATA_FILE, arsenal);
    logujAkcje("DOSTAWA", `Dodano: ${req.body.nazwa}`, req.session.user.login);
    res.redirect('/');
});

app.post('/edytuj', wymaganeLogowanie, upload.single('zdjecie'), (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const idx = arsenal.findIndex(i => i.id == req.body.id);
    if (idx !== -1) {
        Object.assign(arsenal[idx], req.body, { ilosc: parseInt(req.body.ilosc), cena: parseFloat(req.body.cena), min_ilosc: parseInt(req.body.min_ilosc) });
        if (req.file) arsenal[idx].obrazek = '/uploads/' + req.file.filename;
        zapiszPlik(DATA_FILE, arsenal);
        logujAkcje("EDYCJA", `Edycja: ${req.body.nazwa}`, req.session.user.login);
    }
    res.redirect('/');
});

app.post('/usun/:id', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const usuniety = arsenal.find(i => i.id == req.params.id);
    arsenal = arsenal.filter(i => i.id != req.params.id);
    zapiszPlik(DATA_FILE, arsenal);
    if(usuniety) logujAkcje("USUNIĘCIE", `Usunięto: ${usuniety.nazwa}`, req.session.user.login);
    res.redirect('/');
});

app.post('/zmien/:id/:akcja', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const idx = arsenal.findIndex(i => i.id == req.params.id);
    if (idx !== -1) {
        if(req.params.akcja == 'plus') arsenal[idx].ilosc++;
        else if(req.params.akcja == 'minus' && arsenal[idx].ilosc > 0) arsenal[idx].ilosc--;
        zapiszPlik(DATA_FILE, arsenal);
    }
    res.redirect('/');
});

app.post('/wydaj', wymaganeLogowanie, (req, res) => {
    let arsenal = wczytajPlik(DATA_FILE);
    const idx = arsenal.findIndex(i => i.id == req.body.id);
    const ilosc = parseInt(req.body.ilosc);
    if (idx !== -1 && arsenal[idx].ilosc >= ilosc) {
        arsenal[idx].ilosc -= ilosc;
        zapiszPlik(DATA_FILE, arsenal);
        logujAkcje("WYDANIE", `Wydano ${ilosc} szt. ${arsenal[idx].nazwa} (${req.body.cel})`, req.session.user.login);
    }
    res.redirect('/');
});

app.listen(PORT, () => console.log(`Serwer startuje na porcie ${PORT}`));