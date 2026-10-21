package com.pixesistemas.pos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

import android.util.Base64;

@CapacitorPlugin(name = "TcpPrinter")
public class TcpPrinterPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        String host = call.getString("host", "");
        Integer port = call.getInt("port", 9100);
        String base64 = call.getString("data", "");

        if (host == null || host.trim().isEmpty()) {
            call.reject("Falta la IP de la impresora.");
            return;
        }
        if (base64 == null || base64.isEmpty()) {
            call.reject("No hay datos para imprimir.");
            return;
        }

        final int printerPort = port == null || port <= 0 ? 9100 : port;

        new Thread(() -> {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host.trim(), printerPort), 5000);
                socket.setSoTimeout(5000);
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                OutputStream output = socket.getOutputStream();
                output.write(data);
                output.flush();
                call.resolve(new JSObject().put("ok", true));
            } catch (Exception error) {
                call.reject("No se pudo imprimir en " + host + ":" + printerPort + ": " + error.getMessage());
            }
        }).start();
    }
}
