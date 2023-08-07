/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/UnitTests/JUnit5TestClass.java to edit this template
 */
package com.oracle.jdtls.ext.launcher;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.BeforeAll;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInfo;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 *
 * @author sdedic
 */
public class QuotedLineParserTest {
    
    public QuotedLineParserTest() {
    }
    
    private TestInfo testInfo;

    @BeforeEach
    public void setUp() throws Exception {
    }
    
    @BeforeEach
    public void info(TestInfo info) {
        this.testInfo = info;
    }

    @AfterEach
    public void tearDown() throws Exception {
    }
    
    @BeforeAll
    public static void setUpClass() {
        System.err.println("");
    }
    
    @AfterAll
    public static void tearDownClass() {
    }
    
    @ParameterizedTest(name="test{0}")
    @ValueSource(strings = {
//        "QuotedAndUnquoted",
//        "QuotedEscape",
        "continuations"
    })
    public void test(String u) throws IOException {
        String inputText;
        
        String n = Character.toLowerCase(u.charAt(0)) + u.substring(1);
        InputStream i2 = getClass().getResourceAsStream(n + ".cmdFile");
        try (InputStream istm = getClass().getResourceAsStream(n + ".cmdfile");
            InputStreamReader r = new InputStreamReader(istm);
            BufferedReader b = new BufferedReader(r)) {
            inputText = b.lines().collect(Collectors.joining("\n"));
        }
        
        List<String> result = new QuotedLineParser(inputText).parseQuotedList();
        List<String> golden;
        
        try (InputStream istm = getClass().getResourceAsStream(n + ".golden");
            InputStreamReader r = new InputStreamReader(istm);
            BufferedReader b = new BufferedReader(r)) {
            golden = new ArrayList<>(b.lines().map(s -> s.replace("\\n", "\n").replace("\\t", "\t")).collect(Collectors.toList()));
        }
        
        assertEquals(golden, result);
    }
}
