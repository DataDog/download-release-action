import * as core from '@actions/core'
import {getOctokit} from '@actions/github'
import {listReleases, updateRelease} from './release.js'

async function run(): Promise<void> {
  // Create octokit client
  const token = core.getInput('github-token', {required: true})
  const debug = core.getBooleanInput('debug')
  const github = getOctokit(token, debug ? {log: console} : undefined)
  // Try to update all releases
  const releases = await listReleases(github)
  if (releases.length === 0) {
    core.info('ℹ️ No release found')
  } else {
    core.info(`ℹ️ ${releases.length} release found.`)
  }
  const updatedReleases = []
  for (const release of releases) {
    if (release.needUpdate()) {
      core.info(
        `ℹ️ Release ${release.tagName()} needs an update (${release.currentVersion?.toString()} => ${release.latestVersion?.toString()}).`
      )
      await updateRelease(github, release)
      core.info(`✅ Release ${release.tagName()} was successfully updated.`)
      updatedReleases.push(release)
    } else {
      core.info(`✅ Release ${release.tagName()} is up-to-date.`)
    }
  }
  core.setOutput('updated-releases', updatedReleases)
}

run().catch(error => core.setFailed(`❌ ${error instanceof Error ? error.message : String(error)}`))
