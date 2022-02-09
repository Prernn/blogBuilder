import { IConfig } from "./interfaces/config.interface.js";
import { getFiles } from "./getFiles.js";
import { parse, resolve } from "path";
import chalk from "chalk";
import { syncConfig } from "./syncConfig.js";
import { IPageMeta } from "./interfaces/pageMeta.interface.js";
import { getDirectories } from "./getDirectories.js";
import { IPageMetaSaturated } from "./interfaces/pageMetaSaturated.interface.js";
import { Render } from "./render.js";
import { marked } from "marked";
import { mkdirSync, readFileSync } from "fs";
import { writeFile } from "fs/promises";
import { frontMatter } from "./frontMatter.js";
import { remark } from "remark";

function compare(a: IPageMeta, b: IPageMeta): -1 | 0 | 1 {
  const afileName = parse(a.pathOnDisk).name;
  const bfileName = parse(b.pathOnDisk).name;
  if (a.template === "menu.hbs" || a.virtual) {
    return -1;
  } else if (b.template === "menu.hbs" || b.virtual) {
    return 1;
  } else if (afileName < bfileName) {
    return -1;
  } else if (afileName > bfileName) {
    return 1;
  }
  return 0;
}

function saturate(
  config: IConfig,
  file: IPageMeta,
  rootGroup: IPageMeta[],
  // fileGroups: { [index: string]: IPageMeta[] },
  target: IPageMeta
): IPageMetaSaturated {
  const lengthOfRoot = config.blogConfig.root.length;
  const pageLocation =
    parse(file.pathOnDisk.substring(lengthOfRoot)).dir + `/${parse(file.pathOnDisk).name}.html`;

  const pagination = pageLocation
    .split("/")
    .filter((x) => x)
    .map((x) => x.replace(/ /g, "_").toLocaleLowerCase());
  pagination.pop();
  pagination.push(parse(file.pathOnDisk).name.toLocaleLowerCase().replace(/ /g, "_"));

  const styles = [];
  // const scripts = [];
  switch (file.template) {
    case "blogPost.hbs":
      styles.push("/css/blogPost.css");
  }

  // href
  const href = `${config.protocol}://${config.baseUrl}/${pagination.join("/").replace(/ /g, "_")}`;

  // page name
  const name = parse(file.pathOnDisk).name;

  // parent
  const parent = "/" + pagination.slice(0, pagination.length - 1).join("/");

  // source
  const sourceUrl = `${config.sourceBaseUrl}/${name}.md`;

  // neightboring pages
  const pageIndex = rootGroup.findIndex((x) => x.pathOnDisk === file.pathOnDisk);
  const next = rootGroup[pageIndex + 1];
  const prev = rootGroup[pageIndex - 1];
  const neighbors = {
    next: next || undefined,
    prev: prev || undefined,
  };

  // siblings
  const siblings = [...rootGroup];
  siblings.splice(pageIndex, 1);

  let content = "";
  try {
    if (!file.virtual) {
      // read the file
      const mdContent = readFileSync(file.pathOnDisk, "utf8");
      // parse the front matter
      const { frontMatter: matter, markdown } = frontMatter(mdContent);
      // parse the markdown
      const ast = remark().processSync(markdown);
      console.log(ast);
      content = marked.parse(markdown);
    }
  } catch (err) {
    console.log(chalk.red(`Error parsing ${file.pathOnDisk}`));
  }

  return {
    ...file,
    pagination,
    href,
    name,
    parent,
    sourceUrl,
    neighbors,
    siblings,
    content,
    styles,
  };
}

async function main(config: IConfig) {
  console.log("getting files");
  const files = await getFiles(config);
  const directories = await getDirectories(config);

  // sync the disk with the config meta and vice versa
  syncConfig(config, files);

  // add the directories as virtual files
  const virtualMenuPages: IPageMeta[] = directories.map((dir) => {
    return {
      template: "menu.hbs",
      pathOnDisk: dir.fullPath + "/index.md",
      virtual: true,
    };
  });
  // add the virtual pages from the config file
  const virtualConfigPages: IPageMeta[] = config.blogConfig.virtualPageMeta;
  config.blogConfig.pageMeta = [
    ...config.blogConfig.pageMeta,
    ...virtualMenuPages,
    ...virtualConfigPages,
  ];

  // do a quick sanity check to see if the blogs root is set correctly
  if (!RegExp(`${config.blogConfig.root}`).test(files[0].fullPath)) {
    console.log(chalk.red(`Error: It looks like your root in config.json is not set corectly.`));
    console.log(chalk.red(`Make sure the root path so it is a parent of your markdown files.`));
    throw new Error("Root path is not set correctly");
  }

  // group each file into its directory
  const fileGroups: { [index: string]: IPageMeta[] } = {};

  // where we will store tempaltes
  const templates = [];

  console.log("grouping files");
  config.blogConfig.pageMeta.forEach((file) => {
    const parsedPath = parse(resolve(file.pathOnDisk));
    fileGroups[parsedPath.dir] = [...(fileGroups[parsedPath.dir] || []), file];
  });

  if (config.buildSinglePage) {
    // where this file is
    const localFileDir = parse(config.file).dir;
    // the files group (siblings)
    const localRootGroup = fileGroups[localFileDir];
    localRootGroup.sort(compare);
    // this file among its siblings
    const target = localRootGroup.find((x) => x.pathOnDisk === resolve(config.file));
    if (!target) {
      throw new Error("Could not find target file in the local root group");
    }
    templates.push(saturate(config, target, localRootGroup, target));
  } else {
    // for each group
    for (let i = 0; i < Object.keys(fileGroups).length; i++) {
      // the group name we are working on
      const group = Object.keys(fileGroups)[i];
      // the files group (siblings)
      const localRootGroup = fileGroups[group];
      for (let j = 0; j < localRootGroup.length; j++) {
        const target = localRootGroup[j];
        if (!target) {
          throw new Error("Could not find target file in the local root group");
        }
        templates.push(saturate(config, target, localRootGroup, target));
      }
    }
  }

  // {
  //     "template": "blogPost.hbs",
  //     "pathOnDisk": "/home/roland/knowledge/tech/Backing Up MongoDB.md",
  //     "virtual": false,
  //     "pagination": [
  //         "tech",
  //         "backing_up_mongodb"
  //     ],
  //     "href": "http://localhost/tech/backing_up_mongodb",
  //     "name": "Backing Up MongoDB",
  //     "parent": "/tech",
  //     "sourceUrl": "https://github.com/rolandwarburton/knowledge/Backing Up MongoDB.md",
  //     "neighbors": {
  //         "next": {
  //             "template": "blogPost.hbs",
  //             "pathOnDisk": "/home/roland/knowledge/tech/Grimoire.md",
  //             "virtual": false
  //         }
  //     },
  //     "siblings": [
  //         {
  //             "template": "blogPost.hbs",
  //             "pathOnDisk": "/home/roland/knowledge/tech/Grimoire.md",
  //             "virtual": false
  //         },
  //         {
  //             "template": "blogPost.hbs",
  //             "pathOnDisk": "/home/roland/knowledge/tech/certbot.md",
  //             "virtual": false
  //         },
  //         {
  //             "template": "blogPost.hbs",
  //             "pathOnDisk": "/home/roland/knowledge/tech/dockerode.md",
  //             "virtual": false
  //         },
  //         {
  //             "template": "menu.hbs",
  //             "pathOnDisk": "/home/roland/knowledge/tech/index.md",
  //             "virtual": true
  //         }
  //     ]
  // }
  const render = new Render(config);
  for (const template of templates) {
    console.log(`rendering ${template.name}`);
    const urlPath = new URL(template.href).pathname.substring(1) + "/index.html";

    // TODO figure out why i need to replace /index/index.html
    // resolve the output + the url path
    // also replace duplicate index's (not sure why this happens yet)
    const fileOutputPath = resolve(config.output, urlPath).replace(
      /\/index\/index.html/,
      "/index.html"
    );
    try {
      mkdirSync(parse(fileOutputPath).dir, { recursive: true });
    } catch (err) {}
    writeFile(fileOutputPath, render.render(template));
  }
}
export { main };
