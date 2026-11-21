
import sqlite3
import pandas as pd
from sklearn.linear_model import LinearRegression
from pathlib import Path

# Connect to existing SQLite database
db_path = Path(__file__).parent / "backend" / "inventory.db"
conn = sqlite3.connect(db_path)

# Get products and sales data
products = pd.read_sql_query(
    "SELECT id, name, qty, expiryDate FROM products",
    conn
)

sales = pd.read_sql_query(
    "SELECT productId, quantitySold, saleDate FROM sales",
    conn
)

print("\n===== AI EXPIRY PREDICTION =====\n")

if sales.empty:
    print("No sales data available. Add sales first.")
else:
    sales["saleDate"] = pd.to_datetime(sales["saleDate"])

    for _, product in products.iterrows():

        product_sales = sales[
            sales["productId"] == product["id"]
        ].copy()

        expiry = pd.to_datetime(
            product["expiryDate"], errors="coerce"
        )

        days_left = (expiry - pd.Timestamp.today().normalize()).days

        if pd.isna(expiry) or days_left <= 0:
            print(f"{product['name']}: Product already expired or invalid date")
            continue

        if product_sales.empty:
            print(f"{product['name']}: No sales history available")
            continue

        # Calculate daily sales
        daily_sales = (
            product_sales.groupby("saleDate")["quantitySold"]
            .sum()
            .reset_index()
        )

        daily_sales["day_number"] = (
            daily_sales["saleDate"] - daily_sales["saleDate"].min()
        ).dt.days

        X = daily_sales[["day_number"]]
        y = daily_sales["quantitySold"]

        # Train Linear Regression model
        if daily_sales["day_number"].nunique() >= 2:
            model = LinearRegression()
            model.fit(X, y)

            future_days = pd.DataFrame({
                "day_number": range(
                    int(daily_sales["day_number"].max()) + 1,
                    int(daily_sales["day_number"].max()) + days_left + 1
                )
            })

            predicted_sales = model.predict(future_days).sum()
        else:
            predicted_sales = y.mean() * days_left

        predicted_sales = max(0, round(predicted_sales))
        expected_stock = max(0, int(product["qty"]) - predicted_sales)

        if expected_stock > 0:
            risk = "HIGH"
            suggestion = "Give discount to sell remaining stock"
        else:
            risk = "LOW"
            suggestion = "Stock is likely to sell before expiry"

        print(f"Product: {product['name']}")
        print(f"Current Stock: {product['qty']}")
        print(f"Days Until Expiry: {days_left}")
        print(f"Predicted Sales: {predicted_sales}")
        print(f"Expected Unsold Stock: {expected_stock}")
        print(f"Risk Level: {risk}")
        print(f"Suggestion: {suggestion}")
        print("-----------------------------")

conn.close()
