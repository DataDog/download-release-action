import * as fs from 'fs'
import {context} from '@actions/github'
import download from 'download'
import {DownloadRelease, GitHub, Version} from './types'

const assetFile = 'dd-java-agent.jar'

type Asset = {
  id: number
  name: string
}

export async function listReleases(github: GitHub): Promise<DownloadRelease[]> {
  const response = await github.paginate('GET /repos/{owner}/{repo}/releases', {
    owner: context.repo.owner,
    repo: context.repo.repo
  })

  const publishedVersions = response
    .filter(release => !release.draft && !release.prerelease)
    .map(release => release.tag_name)

  const versions = [] as Version[]
  for (const publishedVersion of publishedVersions) {
    const version = Version.fromTag(publishedVersion)
    if (version) {
      const major = version.major
      if (!versions[major] || version.isNewerThan(versions[major])) {
        versions[major] = version
      }
    }
  }

  const downloadReleases = [] as DownloadRelease[]
  for (const version of response) {
    const downloadRelease = DownloadRelease.fromTag(version.id, version.tag_name)
    if (downloadRelease) {
      const major = downloadRelease.major
      if (version.body) {
        downloadRelease.currentVersion = extractVersionFromBody(version.body)
      }
      downloadRelease.latestVersion = versions[major]
      downloadReleases[major] = downloadRelease
    }
  }

  return downloadReleases
}

function extractVersionFromBody(body: String): Version | undefined {
  for (const bodyLine of body.split('\n')) {
    const version = Version.fromTag(bodyLine)
    if (version) {
      return version
    }
  }
}

export async function updateRelease(github: GitHub, release: DownloadRelease): Promise<void> {
  if (!release.needUpdate() || release.latestVersion === undefined) {
    return
  }
  await downloadAgentAsset(release.latestVersion)
  await updateReleaseAsset(github, release, assetFile)
  await updateReleaseBody(github, release)
}

export async function downloadAgentAsset(version: Version): Promise<void> {
  const url = `https://github.com/DataDog/dd-trace-java/releases/download/${version.tagName()}/dd-java-agent-${version.toString()}.jar`
  await download(url, '.', {filename: assetFile})
}

async function updateReleaseAsset(github: GitHub, release: DownloadRelease, localFileName: string): Promise<void> {
  if (release.latestVersion === undefined) {
    throw new Error('Failed to update asset. No latest version defined.')
  }
  const currentAsset = await getAgentAsset(github, release)
  const assetName = currentAsset ? `dd-java-agent-${release.latestVersion.tagName()}.jar` : assetFile
  const newAsset = await uploadAsset(github, release, localFileName, assetName)
  if (currentAsset) {
    await renameAsset(github, release, currentAsset, newAsset)
  }
}

async function getAgentAsset(github: GitHub, release: DownloadRelease): Promise<Asset | undefined> {
  const assetResponse = await github.rest.repos.listReleaseAssets({
    owner: context.repo.owner,
    repo: context.repo.repo,
    release_id: release.id
  })
  if (assetResponse.status !== 200) {
    throw new Error(`Failed to list release ${release.major} assets.`)
  }
  for (const asset of assetResponse.data) {
    if (asset.name === assetFile) {
      return asset
    }
  }
}

async function uploadAsset(
  github: GitHub,
  release: DownloadRelease,
  localFileName: string,
  assetName: string
): Promise<Asset> {
  const uploadResponse = await github.rest.repos.uploadReleaseAsset({
    owner: context.repo.owner,
    repo: context.repo.repo,
    release_id: release.id,
    name: assetName,
    data: fs.readFileSync(localFileName).toString()
  })
  if (uploadResponse.status !== 201) {
    throw new Error(`Failed to upload ${localFileName} to release ${release.latestVersion}.`)
  }
  return uploadResponse.data
}

async function renameAsset(github: GitHub, release: DownloadRelease, fromAsset: Asset, toAsset: Asset): Promise<void> {
  const deleteResponse = await github.rest.repos.deleteReleaseAsset({
    owner: context.repo.owner,
    repo: context.repo.repo,
    asset_id: toAsset.id
  })
  if (deleteResponse.status !== 204) {
    throw new Error(`Failed to delete asset ${toAsset.name}`)
  }
  const updateResponse = await github.rest.repos.updateReleaseAsset({
    owner: context.repo.owner,
    repo: context.repo.repo,
    asset_id: fromAsset.id,
    name: toAsset.name
  })
  if (updateResponse.status !== 200) {
    throw new Error(`Failed to update asset name from ${fromAsset.name} to ${toAsset.name}.`)
  }
}

async function updateReleaseBody(github: GitHub, release: DownloadRelease): Promise<void> {
  const response = await github.rest.repos.updateRelease({
    owner: context.repo.owner,
    repo: context.repo.repo,
    release_id: release.id,
    body:
      `# Download\n\n` +
      `This release tracks the latest v${release.major} available, currently ${release.latestVersion}.`
  })
  if (response.status !== 200) {
    throw new Error(`Failed to update release ${release.major} body.`)
  }
}
