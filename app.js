const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const http = require('http')
const path = require('path')
const app = express()
const {Server} = require("socket.io")

let db = new sqlite3.Database(path.join(__dirname, '/chat-room.sqlite'))
db.get('select * from users', (err, row) => {
    if (err) {
        db.run(`create table users
                (
                    id       INTEGER constraint users_pk primary key autoincrement,
                    username TEXT not null
                )`)
        console.log('created users table')
    }
})
db.get('select * from lobby', (err, row) => {
    if (err) {
        db.run(`create table lobby
                (
                    id      INTEGER constraint lobby_pk primary key autoincrement,
                    user_id INTEGER not null,
                    message TEXT not null
                )`)
        console.log('created lobby table')
    }
})
db.get('select * from chat', (err, row) => {
    if (err) {
        db.run(`create table chat
                (
                    id      INTEGER constraint chat_pk primary key autoincrement,
                    from_id INTEGER not null,
                    to_id   INTEGER not null,
                    message TEXT not null
                )`)
        console.log('created chat table')
    }
})

app.set('view engine', 'ejs')
app.use(express.urlencoded({extended: true}))
app.use(express.static(path.join(__dirname, 'public')))

let server = http.createServer(app)
const io = new Server(server)
io.on('connection', (socket) => {
    console.log('a user connected')

    socket.on('register', (data) => {
        if (data.type === 'lobby') {
            socket.on('message', (data2) => {
                db.run('insert into lobby(user_id, message) values (?, ?)', [data2.userId, data2.message])
                socket.broadcast.emit('message-lobby', {username: data2.username, message: data2.message})
            })
        } else if (data.type === 'pv') {
            socket.join(data.fromUserId)
            socket.on('pv-message', (data2) => {
                db.run('insert into chat(from_id, to_id, message) values (?, ?, ?)', [data.fromUserId, data.toUserId, data2.message])
                socket.to(data.toUserId).emit('message', {message: data2.message})
            })
        }
    })
})

app.get('/', (req, res, next) => {
    res.sendFile(path.join(__dirname, '/public/first-page.html'))
})
app.post('/login', (req, res, next) => {
    db.get('select * from users where username = ?', req.body.username, (err, row) => {
        let userId
        if (!row) {
            db.run('insert into users(username) values(?)', req.body.username, (err) => {
                db.get('select * from users where username = ?', req.body.username, (err, row) => {
                    userId = row.id
                    io.emit('newUser', {userId: userId, username: req.body.username})
                    res.redirect(`/lobby?id=${userId}`)
                })
            })
        } else {
            userId = row.id
            res.redirect(`/lobby?id=${userId}`)
        }
    })
})
app.get('/lobby', (req, res, next) => {
    let userId = req.query.id
    db.get('select * from users where id = ?', userId, (err, row) => {
        db.all(`select * from lobby
                    join users on lobby.user_id = users.id`, (err, all) => {
            db.all(`select * from users
                        where id != ?`, [row.id], (err, allUsers) => {
                res.render(path.join(__dirname, '/public/lobby'), {userId: row.id, username: row.username, chats: all, users: allUsers})
            })
        })
    })
})

app.get('/pv', (req, res, next) => {
    let userId = req.query.id
    let userId2 = req.query.id2
    db.get('select * from users where id = ?', userId, (err, row) => {
        db.get('select * from users where id = ?', userId2, (err2, row2) => {
            db.all(`select * from chat where (from_id = ? and to_id = ?) or (from_id = ? and to_id = ?)`, [userId, userId2, userId2, userId], (err, all) => {
                res.render(path.join(__dirname, '/public/pv'), {userId: row.id, username: row.username, userId2: row2.id, username2: row2.username, chats: all})
            })
        })
    })
})

server.listen(80, function () {
    console.log('program started')
})