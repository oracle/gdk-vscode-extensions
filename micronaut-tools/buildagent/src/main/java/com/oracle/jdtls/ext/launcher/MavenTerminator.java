/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.oracle.jdtls.ext.launcher;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.function.Consumer;

/**
 * On Windows, vscode does not terminate the entire process subtree for some reason, and 
 * terminates the Launcher in a way that does not even trigger the VM shutdown hook. Therefore
 * this class is launched as a separate process on Windows.
 * On startup, it assumes that at least one other process (the maven commandline launcher) is running.
 * 
 * @author sdedic
 */
public class MavenTerminator {
    public static void main(String[] args) throws Exception {
        Optional<ProcessHandle> parentHandle = ProcessHandle.current().parent();
        if (parentHandle.isEmpty()) {
            throw new IllegalArgumentException("Started as a zombie!");
        }
        ProcessHandle parent = parentHandle.get();
        ProcessHandle current = ProcessHandle.current();
        
        final List<ProcessHandle> snapshot = Collections.synchronizedList(parent.descendants().filter(c -> c.pid() != current.pid()).toList());
        
        // assume at least the maven process is running:
        if (snapshot.isEmpty()) {
            throw new IllegalStateException("No processes to watch");
        }
        CountDownLatch terminated = new CountDownLatch(1);
        
        Consumer<ProcessHandle> c = (h) -> {
            snapshot.remove(h);
            if (snapshot.isEmpty()) {
                terminated.countDown();
            }
        };
        // watch the child processes and if they all terminate, close the MavenTerminator itself.
        snapshot.forEach(h -> h.onExit().thenAccept(c));
        
        // monitor exit of the parent (Launcher) process.
        parent.onExit().thenAccept(x -> {
            try {
                // an arbitrary delay to potentially allow the processes to complete
                Thread.sleep(2000);
            } catch (InterruptedException ex) {
                ex.printStackTrace();
            }
            List<ProcessHandle> toKill = new ArrayList<>(snapshot);
            for (ProcessHandle h : snapshot) {
                h.descendants().forEach(toKill::add);
            }
            toKill.forEach(h -> {
                if (h.isAlive()) {
                    h.destroy();
                }
            });
            terminated.countDown();
        });
        
        terminated.await();
    }
}
