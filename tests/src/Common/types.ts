export enum BuildTool {
  Maven = 'MAVEN',
  Gradle = 'GRADLE',
  Unsupported = 'Unsupported',
}

export enum SupportedJava {
  AnyJava17 = 'java17',
  Unsupported = 'Unsupported',
  AnyJava = 'java',
}

export enum Feature {
  DATABASE = 'DATABASE',
  EMAIL = 'EMAIL',
  K8S = 'K8S',
  LOGGING = 'LOGGING',
  METRICS = 'METRICS',
  OBJECTSTORE = 'OBJECTSTORE',
  SDK = 'SDK',
  SECRETMANAGEMENT = 'SECRETMANAGEMENT',
  SECURITY = 'SECURITY',
  STREAMING = 'STREAMING',
  TRACING = 'TRACING',
}

export type ProjectDescription = GeneratedProject | CopiedProject;
type NamedProject = { name?: string };
export type GeneratedProject = NamedProject & {
  _type: 'generated';
  buildTool: BuildTool;
  features: Feature[];
  java?: SupportedJava;
};
export type CopiedProject = NamedProject & {
  _type: 'copied';
  copyPath: string;
};

export type Arg<T extends string> = {
  name: T;
  args: string[];
};

export type UITestArg = Arg<'runTest-ui'>;
export type APITestArg = Arg<'runTest'>;
export type GenArg = Arg<'generate'>;
export type AllArg = Arg<'__all__'>;
