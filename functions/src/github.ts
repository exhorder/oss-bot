/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as util from "./util";
import * as GithubApi from "@octokit/rest";

/**
 * Get a new client for interacting with Github.
 * @param {string} token Github API token.
 */
export class GithubClient {
  private token: string;
  private api: GithubApi;

  constructor(token: string) {
    // Github API token
    this.token = token;

    // Underlying Github API client
    this.api = new GithubApi({
      timeout: 5000
    });
  }

  /**
   * Authenticate with Github as the bot. This function should be called before
   * each use of the Github API.
   */
  auth() {
    this.api.authenticate({
      type: "oauth",
      token: this.token
    });
  }

  /**
   * Add a label to a github issue, returns a promise.
   */
  addLabel(
    org: string,
    name: string,
    number: number,
    label: string
  ): Promise<any> {
    this.auth();

    return this.api.issues.addLabels({
      owner: org,
      repo: name,
      number: number,
      labels: [label]
    });
  }

  /**
   * Remove a label from github issue, returns a promise.
   */
  removeLabel(
    org: string,
    name: string,
    number: number,
    label: string
  ): Promise<any> {
    this.auth();

    return this.api.issues.removeLabel({
      owner: org,
      repo: name,
      number: number,
      name: label
    });
  }

  /**
   * Add a comment to a github issue, returns a promise.
   */
  addComment(
    org: string,
    name: string,
    number: number,
    body: string
  ): Promise<any> {
    this.auth();

    return this.api.issues.createComment({
      owner: org,
      repo: name,
      number: number,
      body: body
    });
  }

  /**
   * Gets issue template from a github repo.
   */
  getIssueTemplate(org: string, name: string, file: string) {
    this.auth();

    console.log(`GithubClient.getIssueTemplate: ${org}/${name}, file=${file}`);
    return this.getFileContent(org, name, file);
  }

  /**
   * Gets file content from a github repo.
   */
  getFileContent(org: string, name: string, file: string) {
    this.auth();

    return this.api.repos
      .getContents({
        owner: org,
        repo: name,
        path: file
      })
      .then(function(res) {
        // Content is encoded as base64, we need to decode it
        return new Buffer(res.data.content, "base64").toString();
      });
  }

  /**
   * Closes an issue on a github repo.
   */
  closeIssue(org: string, name: string, number: number): Promise<any> {
    this.auth();

    // Add the closed-by-bot label
    const add_label = this.api.issues.addLabels({
      owner: org,
      repo: name,
      number: number,
      labels: ["closed-by-bot"]
    });

    // Close the issue
    const close_issue = this.api.issues.update({
      owner: org,
      repo: name,
      number: number,
      state: "closed"
    });

    return Promise.all([add_label, close_issue]);
  }

  /**
   * Get all comments on a GitHUb issue.
   */
  getCommentsForIssue(owner: string, repo: string, number: number) {
    return paginate(this.api.issues.listComments, {
      owner,
      repo,
      number
    });
  }

  /**
   * Get information about a GitHub organization.
   */
  getOrg(org: string) {
    this.auth();

    return this.api.orgs.get({
      org
    });
  }

  /**
   * List all the repos in a GitHub organization.
   */
  getReposInOrg(org: string) {
    this.auth();

    return paginate(this.api.repos.listForOrg, {
      org
    });
  }

  /**
   * List all the issues (open or closed) on a GitHub repo.
   */
  getIssuesForRepo(owner: string, repo: string, state?: IssueState) {
    this.auth();

    state = state || "all";
    return paginate(this.api.issues.listForRepo, {
      owner,
      repo,
      state
    });
  }

  /**
   * List Github logins of all collaborators on a repo, direct or otherwise.
   */
  getCollaboratorsForRepo(owner: string, repo: string) {
    this.auth();

    return paginate(this.api.repos.listCollaborators, {
      owner,
      repo,
      affiliation: "all"
    }).then(collabs => {
      return collabs.map(c => c.login);
    });
  }
}

type IssueState = "open" | "closed" | "all";

/**
 * Interface for a Github API call.
 */
interface GithubFn<S, T> {
  (args: S): Promise<GithubApi.Response<T>>;
}

/**
 * Interface for the parameters to a call to the GitHub API
 * that can be paginated.
 */
interface PageParams {
  // Results per page (max 100)
  per_page?: number;

  // Page number of the results to fetch.
  page?: number;

  // Ignore extra properties
  [others: string]: any;
}

/**
 * Read all pages of a Github API call and return them all as an
 * array.
 */
async function paginate<S extends PageParams, T>(
  fn: GithubFn<S, Array<T>>,
  options: S
) {
  const per_page = 100;
  let pagesRemaining = true;
  let page = 0;

  let allData = [] as T[];
  while (pagesRemaining) {
    page++;

    // Merge pagination options with the options passed in
    const pageOptions = Object.assign(
      {
        per_page,
        page
      },
      options
    );

    const res = await fn(pageOptions);
    allData = allData.concat(res.data);

    // We assume another page remaining if we got exactly as many
    // issues as we asked for.
    pagesRemaining = res.data.length == per_page;

    // Wait 0.5s between pages
    await util.delay(0.5);
  }

  return allData;
}
