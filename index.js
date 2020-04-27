const axios = require('axios')
const { curry, forEach } = require('lodash')
const fs = require('fs')
const toMarkdown = require('to-markdown')

const headers = { Authorization: `Bearer ${process.argv[2]}` }
const fetch = (url, opts = {}) =>
  axios(url, Object.assign({}, { headers }, opts))

const logErr = (err) => {
  console.error(err)
  process.exitCode = 1
  return
}

// fetchPrivateFolder :: (number) => Promise<*>
const fetchPrivateFolder = (id) =>
  fetch(`https://platform.quip.com/1/folders/${id}`)

// fetchDocs :: (Array<number>, string) => Promise<*>
const fetchDocs = (children, folderName = 'output') => {
  fs.mkdir(folderName, 0o777, (err) => {
    if (err) return logErr(`❌ Failed to create folder ${folderName}. ${err}`)

    console.log(`🗂 ${folderName} created successfully`)
  })

  const ids = children
    .filter(({ thread_id }) => !!thread_id)
    .map(({ thread_id }) => thread_id)
    .join(',')

  const folderIds = children
    .filter(({ folder_id }) => !!folder_id)
    .map(({ folder_id }) => folder_id)

  forEach(folderIds, (folderId) => fetchThreads(folderId, folderName))

  return fetch(`https://platform.quip.com/1/threads/?ids=${ids}`)
    .then(writeFiles(folderName))
}

// fetchThreads :: (number, string) => Promise<*>
const fetchThreads = (folderId, parentDir) => {
  return fetch(`https://platform.quip.com/1/folders/${folderId}`)
    .then(({ data }) => {
      forEach(data, (folder) => {
        if (!folder.title) return

        fetchDocs(data.children, `${parentDir}/${folder.title}`)
      })
    })
}

// writeFiles :: Object => void
const writeFiles = curry((folderName, { data }) => {
  forEach(data, (({ thread, html }) => {
    const file = thread.title.replace(/\//g, '')
    const fileName = `${folderName}/${file}`
    const created = new Date(thread.created_usec / 1000)
    const modified = new Date(thread.updated_usec / 1000)

    fs.writeFile(`${fileName}.html`, html, (err) => {
      if (err) return logErr(`❌ Failed to save ${fileName}.html. ${err}`)

      // ensure that the atime, mtime are set to dates from the thread metadata
      fs.utimes(`${fileName}.html`, modified, created, () => {
        console.log(`✅ ${fileName}.html saved successfully`)
      })
    })

    fs.writeFile(`${fileName}.md`, toMarkdown(html), (err) => {
      if (err) return logErr(`❌ Failed to save ${fileName}.md. ${err}`)

      console.log(`✅ ${fileName}.md saved successfully`)
    })
  }))
})

// main :: () => void
const main = () => {
  if (!process.argv[2]) {
    console.log('❌ Please provide your Quip API token. Exiting.')
    process.exitCode = 1
    return
  }

  var folder_contents
  if (process.argv[3]) {
    const folder_id = process.argv[3]
    folder_contents = fetchPrivateFolder(bunnies)
  } else {
    folder_contents = fetch('https://platform.quip.com/1/users/current')
      .then((res) => {
        return new Promise((resolve, reject) => {
          if (res.status !== 200) return reject(`❌ Error: ${res.statusText}`)

          resolve(res.data.private_folder_id)
        })
      })
      .then(fetchPrivateFolder)
  }

  return folder_contents
    .then(({ data: { children } }) => children)
    .then(fetchDocs)
    .catch(logErr)
}

main()
