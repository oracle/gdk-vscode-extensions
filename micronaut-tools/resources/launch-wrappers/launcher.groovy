/**
 * This is an init script, which configures the Exec-class tasks to invoke the specified Main class,
 * use a specified application params, JVM params and JVM debug settings.
 */
import org.gradle.api.Project;
import org.gradle.api.tasks.JavaExec;

allprojects {
    apply plugin: LaunchWrapperPlugin   
}

class LaunchWrapperPlugin implements Plugin<Project> {
    private static final GradleVersion GRADLE_VERSION = GradleVersion.current().getBaseVersion();
    private static final Logger LOG = Logging.getLogger(LaunchWrapperPlugin.class);

    private static final String RUN_SINGLE_TASK = "runSingle";
    private static final String RUN_SINGLE_MAIN = "runClassName";
    private static final String RUN_SINGLE_ARGS = "runArgs";
    private static final String RUN_SINGLE_JVM_ARGS = "runJvmArgs";
    private static final String RUN_SINGLE_CWD = "runWorkingDir";

    void apply(Project project) {
        project.afterEvaluate {
            if (project.getPlugins().hasPlugin("java") &&
                project.hasProperty(RUN_SINGLE_MAIN)) {
                
                Task runTask = null;
                try {
                
                    runTask = project.tasks.named("run").get();
                } catch (UnknownTaskException ex) {
                    // ignore.
                }
                
                project.tasks.withType(JavaExec.class) {
                    System.err.println("exec task: " + it);
                    
                    if (project.hasProperty(RUN_SINGLE_MAIN)) {
                        String main = project.property(RUN_SINGLE_MAIN);
                        
                        if (GRADLE_VERSION.compareTo(GradleVersion.version("6.4")) < 0) {
                            it.setMainClass(main);
                        } else {
                            it.getMainClass().set(main);
                        }
                    }
                    
                    if (project.hasProperty(RUN_SINGLE_ARGS)) {
                        it.setArgs(Arrays.asList(project.property(RUN_SINGLE_ARGS).toString().split(" ")));
                    }
                    if (project.hasProperty(RUN_SINGLE_JVM_ARGS)) {
                        // Property jvmArgumentProviders should not be implemented as a lambda to allow execution optimizations.
                        // See https://docs.gradle.org/current/userguide/validation_problems.html#implementation_unknown
                        it.getJvmArgumentProviders().add(new CommandLineArgumentProvider() {
                            // Do not convert to lambda.
                            @Override
                            public Iterable<String> asArguments() {
                                return Arrays.asList(project.property(RUN_SINGLE_JVM_ARGS).toString().split(" "));
                            }
                        });
                    }
                    try {
                        it.setStandardInput(System.in);
                    } catch (RuntimeException ex) {
                        if(LOG.isEnabled(LogLevel.DEBUG)) {
                            LOG.debug("Failed to set STDIN for Plugin: " + je.toString(), ex);
                        } else {
                            LOG.info("Failed to set STDIN for Plugin: " + je.toString());
                        }
                    }
                    if (project.hasProperty(RUN_SINGLE_CWD)) {
                        it.setWorkingDir(project.property(RUN_SINGLE_CWD).toString());
                    }
                }
            }
        }
    }
}
