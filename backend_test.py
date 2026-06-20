#!/usr/bin/env python3
"""
NexTurf ERP Backend API Test Suite
Tests all backend endpoints in the order specified in the review request.
"""

import requests
import json
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://venue-management-pro-2.preview.emergentagent.com/api"

# Test data
ADMIN_USER = "admin"
ADMIN_PASS = "123"

# Global token storage
token = None
test_customer_id = None
test_booking_id = None
test_invoice_id = None
test_staff_id = None

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {name}")
    if details:
        print(f"  Details: {details}")

def test_auth_flow():
    """Test 1: Auth flow"""
    global token
    print("\n" + "="*80)
    print("TEST 1: AUTH FLOW")
    print("="*80)
    
    # 1.1 Login with correct credentials
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "userId": ADMIN_USER,
            "password": ADMIN_PASS
        })
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data and "user" in data:
                token = data["token"]
                log_test("Login with admin/123", True, f"Token received, user: {data['user']['name']}")
            else:
                log_test("Login with admin/123", False, "Missing token or user in response")
        else:
            log_test("Login with admin/123", False, f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_test("Login with admin/123", False, f"Exception: {str(e)}")
    
    # 1.2 Login with wrong password
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "userId": ADMIN_USER,
            "password": "wrongpassword"
        })
        if resp.status_code == 401:
            log_test("Login with wrong password", True, "Correctly returned 401")
        else:
            log_test("Login with wrong password", False, f"Expected 401, got {resp.status_code}")
    except Exception as e:
        log_test("Login with wrong password", False, f"Exception: {str(e)}")
    
    # 1.3 GET /auth/me with token
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            if "userId" in data and data["userId"] == ADMIN_USER:
                log_test("GET /auth/me with token", True, f"User info: {data['name']}")
            else:
                log_test("GET /auth/me with token", False, "Invalid user data")
        else:
            log_test("GET /auth/me with token", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("GET /auth/me with token", False, f"Exception: {str(e)}")
    
    # 1.4 GET /auth/me without token
    try:
        resp = requests.get(f"{BASE_URL}/auth/me")
        if resp.status_code == 401:
            log_test("GET /auth/me without token", True, "Correctly returned 401")
        else:
            log_test("GET /auth/me without token", False, f"Expected 401, got {resp.status_code}")
    except Exception as e:
        log_test("GET /auth/me without token", False, f"Exception: {str(e)}")
    
    # 1.5 GET /health (no auth)
    try:
        resp = requests.get(f"{BASE_URL}/health")
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok") == True:
                log_test("GET /health", True, f"Response: {data}")
            else:
                log_test("GET /health", False, "Missing 'ok: true'")
        else:
            log_test("GET /health", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("GET /health", False, f"Exception: {str(e)}")

def test_booking_invoice_flow():
    """Test 2: Booking + auto-invoice flow (THE CORE)"""
    global test_customer_id, test_booking_id, test_invoice_id
    print("\n" + "="*80)
    print("TEST 2: BOOKING + AUTO-INVOICE FLOW (THE CORE)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2.1 GET /sports
    try:
        resp = requests.get(f"{BASE_URL}/sports", headers=headers)
        if resp.status_code == 200:
            sports = resp.json()
            if len(sports) == 4:
                sport_names = [s["name"] for s in sports]
                expected = ["Football", "Cricket", "Volleyball", "Coaching"]
                if all(name in sport_names for name in expected):
                    log_test("GET /sports", True, f"4 sports found: {sport_names}")
                else:
                    log_test("GET /sports", False, f"Missing expected sports. Got: {sport_names}")
            else:
                log_test("GET /sports", False, f"Expected 4 sports, got {len(sports)}")
        else:
            log_test("GET /sports", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("GET /sports", False, f"Exception: {str(e)}")
    
    # 2.2 Create first booking
    booking_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    booking_payload = {
        "customerName": "Rajesh Kumar",
        "mobile": "9876500001",
        "email": "rajesh@test.com",
        "sport": "Football",
        "bookingDate": booking_date,
        "startTime": "18:00",
        "endTime": "20:00",
        "ratePerHour": 1200,
        "discount": 0,
        "gstRate": 18,
        "advanceAmount": 500,
        "paymentMode": "UPI",
        "status": "Confirmed"
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/bookings", json=booking_payload, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            booking = data.get("booking")
            invoice = data.get("invoice")
            
            if booking and invoice:
                # Verify calculations
                expected_hours = 2
                expected_subtotal = 2400
                expected_tax = 432
                expected_total = 2832
                expected_advance = 500
                expected_balance = 2332
                
                checks = [
                    (booking["totalHours"] == expected_hours, f"totalHours: {booking['totalHours']} == {expected_hours}"),
                    (booking["subtotal"] == expected_subtotal, f"subtotal: {booking['subtotal']} == {expected_subtotal}"),
                    (booking["tax"] == expected_tax, f"tax: {booking['tax']} == {expected_tax}"),
                    (booking["totalAmount"] == expected_total, f"totalAmount: {booking['totalAmount']} == {expected_total}"),
                    (booking["advanceAmount"] == expected_advance, f"advanceAmount: {booking['advanceAmount']} == {expected_advance}"),
                    (booking["balanceAmount"] == expected_balance, f"balanceAmount: {booking['balanceAmount']} == {expected_balance}"),
                    (booking["paymentStatus"] == "Partial", f"paymentStatus: {booking['paymentStatus']} == Partial"),
                    (invoice["invoiceNumber"].startswith("NXT-2026-"), f"Invoice format: {invoice['invoiceNumber']}"),
                ]
                
                all_passed = all(check[0] for check in checks)
                details = "\n    " + "\n    ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
                
                if all_passed:
                    test_customer_id = booking["customerId"]
                    test_booking_id = booking["id"]
                    test_invoice_id = invoice["id"]
                    log_test("Create first booking with auto-invoice", True, details)
                else:
                    log_test("Create first booking with auto-invoice", False, details)
            else:
                log_test("Create first booking with auto-invoice", False, "Missing booking or invoice in response")
        else:
            log_test("Create first booking with auto-invoice", False, f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_test("Create first booking with auto-invoice", False, f"Exception: {str(e)}")
    
    # 2.3 Create 2 more bookings to verify sequential invoice numbers
    invoice_numbers = []
    for i in range(2):
        booking_payload2 = {
            "customerName": f"Customer {i+2}",
            "mobile": f"987650000{i+2}",
            "email": f"customer{i+2}@test.com",
            "sport": "Cricket",
            "bookingDate": booking_date,
            "startTime": "16:00",
            "endTime": "17:00",
            "ratePerHour": 1500,
            "discount": 0,
            "gstRate": 18,
            "advanceAmount": 0,
            "paymentMode": "Cash",
            "status": "Confirmed"
        }
        
        try:
            resp = requests.post(f"{BASE_URL}/bookings", json=booking_payload2, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                invoice_numbers.append(data["invoice"]["invoiceNumber"])
        except Exception as e:
            print(f"  Error creating booking {i+2}: {str(e)}")
    
    if len(invoice_numbers) == 2:
        # Extract numbers and verify they increment
        try:
            num1 = int(invoice_numbers[0].split("-")[-1])
            num2 = int(invoice_numbers[1].split("-")[-1])
            if num2 == num1 + 1:
                log_test("Sequential invoice numbers", True, f"{invoice_numbers[0]} → {invoice_numbers[1]}")
            else:
                log_test("Sequential invoice numbers", False, f"Not sequential: {invoice_numbers}")
        except:
            log_test("Sequential invoice numbers", False, f"Could not parse: {invoice_numbers}")
    else:
        log_test("Sequential invoice numbers", False, f"Only created {len(invoice_numbers)} bookings")
    
    # 2.4 Verify customer was auto-created
    try:
        resp = requests.get(f"{BASE_URL}/customers", headers=headers)
        if resp.status_code == 200:
            customers = resp.json()
            found = any(c["mobile"] == "9876500001" for c in customers)
            if found:
                log_test("Customer auto-created", True, "Found customer with mobile 9876500001")
            else:
                log_test("Customer auto-created", False, "Customer not found")
        else:
            log_test("Customer auto-created", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("Customer auto-created", False, f"Exception: {str(e)}")
    
    # 2.5 Re-use same mobile for another booking (verify no duplicate customer)
    try:
        resp = requests.get(f"{BASE_URL}/customers", headers=headers)
        customers_before = len(resp.json()) if resp.status_code == 200 else 0
        
        booking_payload3 = {
            "customerName": "Rajesh Kumar",
            "mobile": "9876500001",
            "email": "rajesh@test.com",
            "sport": "Volleyball",
            "bookingDate": booking_date,
            "startTime": "14:00",
            "endTime": "15:00",
            "ratePerHour": 800,
            "discount": 0,
            "gstRate": 18,
            "advanceAmount": 0,
            "paymentMode": "Cash",
            "status": "Confirmed"
        }
        
        resp = requests.post(f"{BASE_URL}/bookings", json=booking_payload3, headers=headers)
        if resp.status_code == 200:
            resp2 = requests.get(f"{BASE_URL}/customers", headers=headers)
            customers_after = len(resp2.json()) if resp2.status_code == 200 else 0
            
            if customers_after == customers_before:
                log_test("No duplicate customer on re-use", True, f"Customer count unchanged: {customers_after}")
            else:
                log_test("No duplicate customer on re-use", False, f"Customer count increased: {customers_before} → {customers_after}")
        else:
            log_test("No duplicate customer on re-use", False, f"Booking failed: {resp.status_code}")
    except Exception as e:
        log_test("No duplicate customer on re-use", False, f"Exception: {str(e)}")

def test_payments_flow():
    """Test 3: Payments flow"""
    print("\n" + "="*80)
    print("TEST 3: PAYMENTS FLOW")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 3.1 GET /invoices and find one with balance > 0
    invoice_to_pay = None
    try:
        resp = requests.get(f"{BASE_URL}/invoices", headers=headers)
        if resp.status_code == 200:
            invoices = resp.json()
            for inv in invoices:
                if inv.get("balance", 0) > 0:
                    invoice_to_pay = inv
                    break
            
            if invoice_to_pay:
                log_test("GET /invoices - found invoice with balance", True, 
                        f"Invoice {invoice_to_pay['invoiceNumber']}, balance: {invoice_to_pay['balance']}")
            else:
                log_test("GET /invoices - found invoice with balance", False, "No invoice with balance > 0")
        else:
            log_test("GET /invoices", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("GET /invoices", False, f"Exception: {str(e)}")
    
    # 3.2 POST payment to clear balance
    if invoice_to_pay:
        try:
            payment_payload = {
                "invoiceId": invoice_to_pay["id"],
                "amount": invoice_to_pay["balance"],
                "mode": "Cash",
                "notes": "final payment"
            }
            
            resp = requests.post(f"{BASE_URL}/payments", json=payment_payload, headers=headers)
            if resp.status_code == 200:
                log_test("POST /payments", True, f"Payment recorded: {invoice_to_pay['balance']}")
            else:
                log_test("POST /payments", False, f"Status {resp.status_code}: {resp.text}")
        except Exception as e:
            log_test("POST /payments", False, f"Exception: {str(e)}")
        
        # 3.3 Verify invoice is fully paid
        try:
            resp = requests.get(f"{BASE_URL}/invoices/{invoice_to_pay['id']}", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                inv = data["invoice"]
                if inv["paidAmount"] == inv["totalAmount"] and inv["balance"] == 0:
                    log_test("Invoice fully paid", True, f"paidAmount={inv['paidAmount']}, balance=0")
                else:
                    log_test("Invoice fully paid", False, 
                            f"paidAmount={inv['paidAmount']}, totalAmount={inv['totalAmount']}, balance={inv['balance']}")
            else:
                log_test("Invoice fully paid", False, f"Status {resp.status_code}")
        except Exception as e:
            log_test("Invoice fully paid", False, f"Exception: {str(e)}")
        
        # 3.4 Verify booking paymentStatus updated
        try:
            resp = requests.get(f"{BASE_URL}/bookings", headers=headers)
            if resp.status_code == 200:
                bookings = resp.json()
                booking = next((b for b in bookings if b["id"] == invoice_to_pay["bookingId"]), None)
                if booking:
                    if booking["paymentStatus"] == "Paid" and booking["balanceAmount"] == 0:
                        log_test("Booking paymentStatus updated", True, "Status=Paid, balance=0")
                    else:
                        log_test("Booking paymentStatus updated", False, 
                                f"Status={booking['paymentStatus']}, balance={booking['balanceAmount']}")
                else:
                    log_test("Booking paymentStatus updated", False, "Booking not found")
            else:
                log_test("Booking paymentStatus updated", False, f"Status {resp.status_code}")
        except Exception as e:
            log_test("Booking paymentStatus updated", False, f"Exception: {str(e)}")

def test_dashboard():
    """Test 4: Dashboard aggregations"""
    print("\n" + "="*80)
    print("TEST 4: DASHBOARD AGGREGATIONS")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(f"{BASE_URL}/dashboard", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            
            # Check required keys
            required_keys = ["kpis", "series", "sportData", "paymentSplit", "upcoming", "recentTx", "recentCustomers"]
            missing_keys = [k for k in required_keys if k not in data]
            
            if missing_keys:
                log_test("Dashboard structure", False, f"Missing keys: {missing_keys}")
            else:
                # Check KPIs
                kpis = data["kpis"]
                kpi_keys = ["todaysRevenue", "todaysBookings", "monthsRevenue", "monthsBookings", 
                           "outstanding", "occupancy", "availableSlots"]
                missing_kpis = [k for k in kpi_keys if k not in kpis]
                
                if missing_kpis:
                    log_test("Dashboard KPIs", False, f"Missing KPIs: {missing_kpis}")
                else:
                    # Verify series length
                    if len(data["series"]) == 14:
                        log_test("Dashboard aggregations", True, 
                                f"All keys present, series length=14, KPIs: {kpis}")
                    else:
                        log_test("Dashboard aggregations", False, 
                                f"Series length={len(data['series'])}, expected 14")
        else:
            log_test("Dashboard aggregations", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("Dashboard aggregations", False, f"Exception: {str(e)}")

def test_customer_detail():
    """Test 5: Customer detail/history"""
    print("\n" + "="*80)
    print("TEST 5: CUSTOMER DETAIL/HISTORY")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    if not test_customer_id:
        log_test("Customer detail", False, "No test customer ID available")
        return
    
    try:
        resp = requests.get(f"{BASE_URL}/customers/{test_customer_id}", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            
            required_keys = ["customer", "bookings", "invoices", "payments", "stats"]
            missing_keys = [k for k in required_keys if k not in data]
            
            if missing_keys:
                log_test("Customer detail structure", False, f"Missing keys: {missing_keys}")
            else:
                stats = data["stats"]
                stats_keys = ["totalBookings", "totalRevenue", "totalPaid", "pending", "totalHours", "lastBookingDate"]
                missing_stats = [k for k in stats_keys if k not in stats]
                
                if missing_stats:
                    log_test("Customer stats", False, f"Missing stats: {missing_stats}")
                else:
                    log_test("Customer detail/history", True, 
                            f"All keys present. Stats: bookings={stats['totalBookings']}, revenue={stats['totalRevenue']}")
        else:
            log_test("Customer detail/history", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("Customer detail/history", False, f"Exception: {str(e)}")

def test_expenses_pnl():
    """Test 6: Expenses + P&L"""
    print("\n" + "="*80)
    print("TEST 6: EXPENSES + P&L")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 6.1 POST expense
    expense_payload = {
        "date": "2026-06-25",
        "category": "Electricity",
        "vendor": "TSSPDCL",
        "description": "Monthly bill",
        "amount": 5000
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/expenses", json=expense_payload, headers=headers)
        if resp.status_code == 200:
            log_test("POST /expenses", True, "Expense created")
        else:
            log_test("POST /expenses", False, f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_test("POST /expenses", False, f"Exception: {str(e)}")
    
    # 6.2 GET expenses
    try:
        resp = requests.get(f"{BASE_URL}/expenses", headers=headers)
        if resp.status_code == 200:
            expenses = resp.json()
            found = any(e["category"] == "Electricity" and e["amount"] == 5000 for e in expenses)
            if found:
                log_test("GET /expenses", True, f"Found Electricity expense, total expenses: {len(expenses)}")
            else:
                log_test("GET /expenses", False, "Electricity expense not found")
        else:
            log_test("GET /expenses", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("GET /expenses", False, f"Exception: {str(e)}")
    
    # 6.3 GET P&L report
    try:
        resp = requests.get(f"{BASE_URL}/reports/pnl?from=2026-06-01&to=2026-06-30", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            required_keys = ["revenue", "expense", "net", "expenseByCat"]
            missing_keys = [k for k in required_keys if k not in data]
            
            if missing_keys:
                log_test("P&L report", False, f"Missing keys: {missing_keys}")
            else:
                if data["expense"] >= 5000 and "Electricity" in data["expenseByCat"]:
                    log_test("P&L report", True, 
                            f"Revenue={data['revenue']}, Expense={data['expense']}, Net={data['net']}, Electricity={data['expenseByCat'].get('Electricity', 0)}")
                else:
                    log_test("P&L report", False, 
                            f"Expense={data['expense']} (expected ≥5000), expenseByCat={data['expenseByCat']}")
        else:
            log_test("P&L report", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("P&L report", False, f"Exception: {str(e)}")

def test_gst_report():
    """Test 7: GST report"""
    print("\n" + "="*80)
    print("TEST 7: GST REPORT")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(f"{BASE_URL}/reports/gst?from=2026-06-01&to=2026-06-30", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            required_keys = ["taxable", "cgst", "sgst", "totalTax", "count", "invoices"]
            missing_keys = [k for k in required_keys if k not in data]
            
            if missing_keys:
                log_test("GST report", False, f"Missing keys: {missing_keys}")
            else:
                # Verify CGST == SGST
                if data["cgst"] == data["sgst"]:
                    log_test("GST report", True, 
                            f"Taxable={data['taxable']}, CGST={data['cgst']}, SGST={data['sgst']}, Total={data['totalTax']}, Count={data['count']}")
                else:
                    log_test("GST report", False, f"CGST ({data['cgst']}) != SGST ({data['sgst']})")
        else:
            log_test("GST report", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("GST report", False, f"Exception: {str(e)}")

def test_staff_management():
    """Test 8: Staff management"""
    global test_staff_id
    print("\n" + "="*80)
    print("TEST 8: STAFF MANAGEMENT")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 8.1 POST new staff
    staff_payload = {
        "userId": "mgr1",
        "name": "Manager One",
        "role": "Manager",
        "password": "pass123"
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/staff", json=staff_payload, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            test_staff_id = data.get("id")
            if "password" not in data:
                log_test("POST /staff", True, f"Staff created: {data['name']}, no password in response")
            else:
                log_test("POST /staff", False, "Password field present in response")
        else:
            log_test("POST /staff", False, f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_test("POST /staff", False, f"Exception: {str(e)}")
    
    # 8.2 POST duplicate userId
    try:
        resp = requests.post(f"{BASE_URL}/staff", json=staff_payload, headers=headers)
        if resp.status_code == 400:
            data = resp.json()
            if "already exists" in data.get("error", "").lower():
                log_test("POST /staff duplicate userId", True, "Correctly returned 400 with error message")
            else:
                log_test("POST /staff duplicate userId", False, f"Got 400 but wrong error: {data}")
        else:
            log_test("POST /staff duplicate userId", False, f"Expected 400, got {resp.status_code}")
    except Exception as e:
        log_test("POST /staff duplicate userId", False, f"Exception: {str(e)}")
    
    # 8.3 GET staff list
    try:
        resp = requests.get(f"{BASE_URL}/staff", headers=headers)
        if resp.status_code == 200:
            staff_list = resp.json()
            found = any(s["userId"] == "mgr1" for s in staff_list)
            has_password = any("password" in s for s in staff_list)
            
            if found and not has_password:
                log_test("GET /staff", True, f"Found mgr1, no password fields, total staff: {len(staff_list)}")
            else:
                log_test("GET /staff", False, f"Found mgr1: {found}, has password: {has_password}")
        else:
            log_test("GET /staff", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("GET /staff", False, f"Exception: {str(e)}")
    
    # 8.4 Login as mgr1
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "userId": "mgr1",
            "password": "pass123"
        })
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data:
                log_test("Login as mgr1", True, f"Successfully logged in as {data['user']['name']}")
            else:
                log_test("Login as mgr1", False, "No token in response")
        else:
            log_test("Login as mgr1", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("Login as mgr1", False, f"Exception: {str(e)}")
    
    # 8.5 DELETE staff
    if test_staff_id:
        try:
            resp = requests.delete(f"{BASE_URL}/staff/{test_staff_id}", headers=headers)
            if resp.status_code == 200:
                log_test("DELETE /staff", True, "Staff deleted successfully")
            else:
                log_test("DELETE /staff", False, f"Status {resp.status_code}")
        except Exception as e:
            log_test("DELETE /staff", False, f"Exception: {str(e)}")

def test_settings_password():
    """Test 9: Settings + password"""
    print("\n" + "="*80)
    print("TEST 9: SETTINGS + PASSWORD")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 9.1 GET settings
    try:
        resp = requests.get(f"{BASE_URL}/settings", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            checks = [
                ("invoicePrefix" in data and data["invoicePrefix"] == "NXT", f"invoicePrefix: {data.get('invoicePrefix')}"),
                ("financialYear" in data, f"financialYear: {data.get('financialYear')}"),
                ("gstRate" in data and data["gstRate"] == 18, f"gstRate: {data.get('gstRate')}"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n    " + "\n    ".join([f"{'✓' if c[0] else '✗'} {c[1]}" for c in checks])
            
            if all_passed:
                log_test("GET /settings", True, details)
            else:
                log_test("GET /settings", False, details)
        else:
            log_test("GET /settings", False, f"Status {resp.status_code}")
    except Exception as e:
        log_test("GET /settings", False, f"Exception: {str(e)}")
    
    # 9.2 Change password with wrong old password
    try:
        resp = requests.post(f"{BASE_URL}/auth/change-password", json={
            "oldPassword": "wrongpassword",
            "newPassword": "new123"
        }, headers=headers)
        if resp.status_code == 400:
            log_test("Change password with wrong old password", True, "Correctly returned 400")
        else:
            log_test("Change password with wrong old password", False, f"Expected 400, got {resp.status_code}")
    except Exception as e:
        log_test("Change password with wrong old password", False, f"Exception: {str(e)}")
    
    # Note: Not actually changing the password to avoid breaking other tests

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("NEXTURF ERP BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        test_auth_flow()
        test_booking_invoice_flow()
        test_payments_flow()
        test_dashboard()
        test_customer_detail()
        test_expenses_pnl()
        test_gst_report()
        test_staff_management()
        test_settings_password()
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {str(e)}")
    
    print("\n" + "="*80)
    print("TEST SUITE COMPLETED")
    print("="*80)
    print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()
