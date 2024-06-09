require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const { DOMParser } = require('xmldom');
const app = express();
app.use(express.json());
const API_CALL_DELAY = 750;

const port = process.env.PORT || 3000;
const mongoCollection = process.env.MONGO_COLLECTION;
const mongoUri = process.env.MONGO_URI;

mongoose.connect(mongoUri)
    .then(() => console.log('MongoDB connection successful'))
    .catch(err => console.error('MongoDB connection error:', err));

const gameSchema = new mongoose.Schema({
    id: String,
    name: String,
    year: String,
    thumbnail: String,
    image: String,
    minPlayers: String,
    maxPlayers: String,
    playingTime: String,
    minPlayTime: String,
    maxPlayTime: String,
});

const Game = mongoose.model('Game', gameSchema);

function delay(ms = API_CALL_DELAY) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Eigene Sammlung aktualisieren
app.get('/api/updateCollection', async (req, res) => {
    const username = req.query.username;

    try {
        const response = await axios.get(`https://api.geekdo.com/xmlapi2/collection?username=${username}`);
        const xmlText = response.data;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
        const items = xmlDoc.getElementsByTagName('item');
        if (items.length === 0) {
            return res.status(404).send('No games found in collection');
        }
        let newEntriesCount = 0;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const status = item.getElementsByTagName('status')[0];
            if (status && status.getAttribute('own') === '1') {
                const gameId = item.getAttribute('objectid');
                let game = await Game.findOne({ id: gameId });
                if (!game) {
                    // console.log("new game found...");
                    const gameDetails = await fetchGameDetails(gameId);
                    if (gameDetails) {
                        const newGame = new Game(gameDetails);
                        await newGame.save();
                        newEntriesCount++;
                    }
                    await delay(750);
                }
                else {
                    // console.log(`${game.name} skipped: game already in collection.`)
                }
            }
        }

        res.send(`Collection updated successfully.<br>New entries added: ${newEntriesCount}.<br>Total games in the database: ${await Game.countDocuments()}`);
    } catch (error) {
        res.status(500).send(error.toString());
    }
});


// Route, um die Listeneinträge zu überprüfen und zu aktualisieren
app.post('/api/checkUpdates', async (req, res) => {
    try {
        const games = await Game.find();
        for (let game of games) {
            const gameDetails = await fetchGameDetails(game.id);
            if (gameDetails) {
                await Game.updateOne({ id: game.id }, gameDetails);
            }
        }
        res.send('Games updated successfully');
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

// Route, um die Spiele aus der Datenbank zu laden
app.get('/api/games', async (req, res) => {
    try {
        const games = await Game.find();
        res.json(games);
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

app.get('/', (req, res) => {
    res.send('Welcome to this sort-of-funny API');
});

// Funktion zum Abrufen der Spieldetails
async function fetchGameDetails(gameId) {
    const url = `https://api.geekdo.com/xmlapi2/thing?id=${gameId}`;
    try {
        const response = await axios.get(url);
        const xmlText = response.data;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
        const item = xmlDoc.getElementsByTagName('item')[0];

        return {
            id: item.getAttribute('id'),
            name: item.getElementsByTagName('name')[0]?.getAttribute('value') || 'Unknown',
            year: item.getElementsByTagName('yearpublished')[0]?.getAttribute('value') || 'Unknown',
            thumbnail: item.getElementsByTagName('thumbnail')[0]?.textContent || '',
            image: item.getElementsByTagName('image')[0]?.textContent || '',
            minPlayers: item.getElementsByTagName('minplayers')[0]?.getAttribute('value') || 'Unknown',
            maxPlayers: item.getElementsByTagName('maxplayers')[0]?.getAttribute('value') || 'Unknown',
            playingTime: item.getElementsByTagName('playingtime')[0]?.getAttribute('value') || 'Unknown',
            minPlayTime: item.getElementsByTagName('minplaytime')[0]?.getAttribute('value') || 'Unknown',
            maxPlayTime: item.getElementsByTagName('maxplaytime')[0]?.getAttribute('value') || 'Unknown',
        };
    } catch (error) {
        console.error(`Error fetching game details for ID ${gameId}: ${error}`);
        return null;
    }
}

app.listen(port, () => {
    console.log(`Server running at port ${port}`);
});
