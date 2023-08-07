const cp = require('child_process');
const fse = require('fs-extra');
const path = require('path');

const server_dir = path.resolve('jdtls.ext');
const build_agent = path.resolve('buildagent');

fse.mkdirSync(path.resolve('agent'), { recursive: true });

cp.execSync(mvnw()+ ' clean package', {cwd:server_dir, stdio:[0,1,2]} );
copy(path.join(server_dir, 'com.oracle.jdtls.ext.core/target'), path.resolve('server'), (file) => {
    return /^com.oracle.jdtls.ext.core.*.jar$/.test(file);
});

cp.execSync(mvnw()+ ' package', {cwd:build_agent, stdio:[0,1,2]} );
copy(path.join(build_agent, 'target'), path.resolve('agent'), (file) => {
    return /^build-agent-.*\.jar$/.test(file);
});

function copy(sourceFolder, targetFolder, fileFilter) {
    const jars = fse.readdirSync(sourceFolder).filter(file => fileFilter(file));
    fse.ensureDirSync(targetFolder);
    for (const jar of jars) {
        fse.copyFileSync(path.join(sourceFolder, jar), path.join(targetFolder, path.basename(jar)));
    }
}

function isWin() {
    return /^win/.test(process.platform);
}

function mvnw() {
    return isWin()?"mvnw.cmd":"./mvnw";
}
