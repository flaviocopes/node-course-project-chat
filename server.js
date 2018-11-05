const util = require('util')
const readline = require('readline')

const inquirer = require('inquirer')
const Chatkit = require('@pusher/chatkit-server')
const { ChatManager, TokenProvider } = require('@pusher/chatkit')
const { JSDOM } = require('jsdom')

const { window } = new JSDOM()
global.window = window
global.navigator = {}

require('dotenv').config()

const start = async () => {
  const { nickname } = await inquirer.prompt([
    {
      type: 'input',
      name: 'nickname',
      message: 'Choose a nickname'
    }
  ])

  const chatkit = new Chatkit.default({
    instanceLocator: process.env.INSTANCE_LOCATOR,
    key: process.env.SECRET_KEY
  })

  try {
    await chatkit.createUser({ id: nickname, name: nickname })
  } catch (err) {
    if (err.error === 'services/chatkit/user_already_exists') {
      const { useExisting } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useExisting',
          message: 'The nickname exists. Do you want to use it?',
          default: true
        }
      ])

      if (!useExisting) {
        return
      }
    } else {
      console.log(err.error)
      return
    }
  }

  const chatManager = new ChatManager({
    instanceLocator: process.env.INSTANCE_LOCATOR,
    userId: nickname,
    tokenProvider: new TokenProvider({
      url:
        'https://us1.pusherplatform.io/services/chatkit_token_provider/v1/' +
        encodeURIComponent(process.env.INSTANCE_ID) +
        '/token'
    })
  })

  const currentUser = await chatManager.connect()

  let joinableRooms
  let currentRoom

  const joinRoom = async room => {
    const choices = [
      `Hey ${currentUser.name}, we hope you brought pizza!`,
      `Welcome to the party, ${currentUser.name}!`,
      `Big ${currentUser.name} showed up!`,
      `Swooooosh! ${currentUser.name} just landed`,
      `${currentUser.name} joined our party`
    ]

    try {
      await currentUser.joinRoom({ roomId: room.id })
      await currentUser.sendMessage({
        roomId: room.id,
        text: choices[Math.floor(Math.random() * choices.length)]
      })
    } catch (err) {
      console.error(err)
      return
    }
  }

  try {
    joinableRooms = await currentUser.getJoinableRooms()
  } catch (err) {
    console.error(err)
    return
  }

  const rooms = [...currentUser.rooms, ...joinableRooms]

  if (!rooms.length) {
    try {
      const room = await currentUser.createRoom({
        name: 'general'
      })
    } catch (err) {
      console.error(err)
      return
    }
    joinRoom(room)
    currentRoom = room
  } else {
    if (rooms.length === 1) {
      joinRoom(rooms[0])
      currentRoom = rooms[0]
    } else {
      const { roomNameToJoin } = await inquirer.prompt([
        {
          type: 'list',
          name: 'roomNameToJoin',
          message: 'Select a room to join',
          choices: rooms.map(room => room.name)
        }
      ])

      const roomToJoin = rooms.filter(room => room.name === roomNameToJoin)[0]
      joinRoom(roomToJoin)
      currentRoom = roomToJoin
    }
  }

  const input = readline.createInterface({ input: process.stdin })
  input.on('line', async message => {
    if (message === '/people') {
      console.log('People in the room:')
      currentRoom.users.map(user => {
        console.log(user.name)
      })
    } else if (message === '/rooms') {
      const availableRooms = rooms.filter(
        room => room.name !== currentRoom.name
      )

      if (availableRooms.length === 0) {
        console.log('This is the only room available')
      } else {
        console.log('Rooms available:')
        availableRooms.map(room => {
          console.log(room.name)
        })
      }
    } else if (message.startsWith('/join')) {
      const roomName = message.substring(6)

      const room = rooms.filter(room => room.name === roomName)

      if (room.length) {
        joinRoom(room[0])
        currentRoom = room[0]

        console.log(`Switched to the ${roomName} room! 😀`)
      } else {
        console.log('Room not found 😟')
      }
    } else {
      try {
        await currentUser.sendMessage({
          roomId: currentRoom.id,
          text: message
        })
      } catch (err) {
        console.error(err)
        return
      }
    }
  })
  currentUser.subscribeToRoom({
    roomId: currentRoom.id,
    hooks: {
      onNewMessage: message => {
        console.log(
          `${nickname === message.sender.name ? 'me' : message.sender.name}: ${
            message.text
          }`
        )
      }
    },
    messageLimit: 0
  })
}

start()
