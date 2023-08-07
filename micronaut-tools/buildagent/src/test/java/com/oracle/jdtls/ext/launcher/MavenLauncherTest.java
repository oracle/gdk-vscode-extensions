/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.oracle.jdtls.ext.launcher;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInfo;

/**
 *
 * @author sdedic
 */
public class MavenLauncherTest {
    
    private TestInfo testInfo;
    private MavenLauncher ml;
    private LauncherBuilder bldr;
    
    @BeforeEach
    public void beforeEach(TestInfo testInfo) {
        this.testInfo = testInfo;
        this.ml = new MavenLauncher();
    }
    
    String fileName() {
        String s = testInfo.getTestMethod().get().getName();
        return Character.toLowerCase(s.charAt(0)) + s.substring(1);
    }
    
    private List<String> inputArgs() throws IOException {
        List<String> inputArgs;
        
        try (InputStream istm = getClass().getResourceAsStream(fileName() + ".args");
            InputStreamReader r = new InputStreamReader(istm);
            BufferedReader b = new BufferedReader(r)) {
            inputArgs = new ArrayList<>(b.lines().collect(Collectors.toList()));
        }
        ml.setJvmBinaryPath(inputArgs.get(0));
        return inputArgs.subList(1, inputArgs.size());
    }
     
    LauncherBuilder builder() throws IOException {
        List<String> inputArgs = inputArgs();
        LauncherBuilder bldr = new LauncherBuilder(ml, inputArgs);
        this.bldr = bldr;
        return bldr;
    }
    
    void checkGoldenFile(List<String> check) throws IOException {
        List<String> golden;
        try (InputStream istm = getClass().getResourceAsStream(fileName() + ".golden");
            InputStreamReader r = new InputStreamReader(istm);
            BufferedReader b = new BufferedReader(r)) {
            golden = new ArrayList<>(b.lines().collect(Collectors.toList()));
        }
        assertEquals(golden, check.subList(1, check.size()));
    }
    
    /**
     * Checks that mvnw is found in the project directory.
     */
    @Test
    public void wrapperLaunch() throws Exception {
        Path dir = Paths.get(getClass().getProtectionDomain().getCodeSource().getLocation().toURI()).resolve(Paths.get("com", "oracle", "jdtls", "ext", "launcher", "projects", "maven"));
        LauncherBuilder bldr = builder();
        bldr.setProjectDir(dir);
        bldr.build();
        
        ProcessBuilder pb = ml.configureProcessBuilder();
        List<String> check = new ArrayList<>(pb.command());
        
        String wname = System.getProperty("os.name").toLowerCase().contains("win") ? "mvnw.bat" : "mvnw";
        assertEquals(dir.resolve(wname).toString(), check.get(0));

        checkGoldenFile(check);
    }

    /**
     * Check that launch is formed using other maven, if there's no wrapper in the project dir.
     * @throws Exception 
     */
    @Test
    public void noWrapperLaunch() throws Exception {
        Path dir = Paths.get(getClass().getProtectionDomain().getCodeSource().getLocation().toURI()).resolve(Paths.get("com", "oracle", "jdtls", "ext", "launcher", "projects", "mavenNoWrapper"));
        LauncherBuilder bldr = builder();
        bldr.setProjectDir(dir);
        bldr.build();
        
        ProcessBuilder pb = ml.configureProcessBuilder();
        List<String> check = new ArrayList<>(pb.command());
        
        String wname = System.getProperty("os.name").toLowerCase().contains("win") ? "mvnw.bat" : "mvnw";
        assertNotEquals(dir.resolve(wname).toString(), check.get(0));

        checkGoldenFile(check);
    }
}
