const axios = require('axios');
const core = require('@actions/core');
const fs = require('fs');
const github = require('@actions/github');
const toml = require('@iarna/toml');

async function run() {
    try {
        // Read inputs
        const fileName = core.getInput('file-name');
        const openIssue = core.getInput('open-issue') === 'true';

        // Read and parse the file
        const dependencies = await parseDependencyFile(fileName);

        // Check for newer versions and prepare output
        const updates = await checkForUpdates(dependencies);

        core.setOutput('dependencies', JSON.stringify(updates));

        if (updates.length == 0) {
          core.info('🎉 All dependencies are up to date!');
        } else {
          core.info("🟠 The following dependencies are out-of-date:");
          updates.forEach(update => {
            core.info(`${update.name}: (${update.version}) -> (${update.newVersion})`);
          });

          // Open an issue if there are updates and openIssue is true
          if (openIssue) {
//              await createIssue(updates);
          }
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

async function parseDependencyFile(fileName) {
  try {
      const fileContent = fs.readFileSync(fileName, 'utf8');
      const parsedToml = toml.parse(fileContent);

      let dependencies = [];

      for (const [key, value] of Object.entries(parsedToml.libraries)) {
        try{
          core.info(JSON.stringify(value["name"]))
          const version = value["version"]
          const ref = version["ref"]
          if (typeof ref !== 'undefined') {
              const version = parsedToml.versions[ref];
              if (version) {
                  dependencies.push({
                      groupId: value["group"],
                      name: value["name"],
                      version: version
                  });
              }
          } else {
              core.info("Version.ref not found for " + key);
          }
      } catch(ex) {
        core.error(`FOR: Error parsing TOML file: ${ex}`);
      }
      return dependencies;
    }
  } catch (error) {
      core.error(`Error parsing TOML file: ${error}`);
      return [];
  }
}

async function checkForUpdates(dependencies) {
  let updates = [];

  for(const dependency of dependencies) {
    const latestVersion = await fetchLatestVersion(dependency.groupId, dependency.name);
    if (latestVersion && dependency.version !== latestVersion) {
      updates.push({
        name: dependency.name,
        version: dependency.version,
        newVersion: latestVersion
      });
    }
  }
  
  return updates;
}

async function fetchLatestVersion(groupId, artifactId) {
  const url = `https://search.maven.org/solrsearch/select?q=g:"${groupId}"+AND+a:"${artifactId}"&rows=1&wt=json`;

  try {
    const response = await axios.get(url);
    const data = response.data;
    return data.response.docs[0].latestVersion;
  } catch (error) {
    core.error(`Error fetching latest version for ${groupId}:${artifactId}: ${error}`);
    return null;
  }
}

async function createIssue(updates) {
    // Get the token and initialize octokit
    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);

    // Get the context for the repository
    const context = github.context;

    // Construct the issue body
    let issueBody = 'The following dependencies have updates available:\n';
    updates.forEach(update => {
        issueBody += `* \`${update.name}\`: (${update.version}) -> (${update.newVersion})\n`;
    });

    // Construct the issue title with the current date
    const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    const issueTitle = `Dependency Updates: ${currentDate}`;

    // Create the issue
    await octokit.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: issueTitle,
        body: issueBody
    }).then(() => {
      core.info("🟢 Issue Created Successfully!");
    });
}

run();
