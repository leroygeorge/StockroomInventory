@echo off
REM Stockroom: inventory control for small offices
REM Author: Leroy George <georgeleroy.1997@gmail.com>, MIT License
echo This will let other computers on your network reach the inventory server.
echo You must run this file as Administrator (right-click it, "Run as administrator").
echo.
netsh advfirewall firewall add rule name="Stockroom Inventory Server" dir=in action=allow protocol=TCP localport=5000
echo.
echo Done. Port 5000 is now open for other computers on your network.
pause
