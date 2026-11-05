import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.supabase import get_supabase_client

def seed():
    client = get_supabase_client()
    if not client:
        print("Supabase client not configured.")
        return

    products = [
        {
            "id": "11111111-1111-4111-a111-111111111111",
            "name": "Industrial Grade Dual-Band IoT Gateway",
            "category": "Industrial Hardware",
            "sku": "AE-GW-9000X",
            "description": "Ruggedized edge compute gateway designed for automated factory telemetry, SCADA systems, and harsh warehouse conditions. Features IP67 aluminum chassis, redundant dual Ethernet, and hardware watchdog timer.",
            "market_price": 349.00,
            "min_demand_price": 245.00,
            "rating": 4.9,
            "reviews_count": 32,
            "in_stock": True,
            "image_url": "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=800&q=80",
            "specs": {
                "Brand": "AcuEdge",
                "Model": "AE-GW-9000X",
                "Processor": "Quad-Core ARM Cortex-A53 1.5GHz",
                "RAM": "4GB LPDDR4 ECC",
                "Storage": "64GB eMMC 5.1",
                "Operating Temp": "-40C to +85C",
                "Ingress Protection": "IP67 Certified",
                "Interfaces": "2x Gigabit RJ45, 1x RS-485 Modbus, 2x USB 3.0",
                "MOQ": "10",
                "Unit": "unit"
            }
        },
        {
            "id": "22222222-2222-4222-a222-222222222222",
            "name": "Precision Ultrasonic Flow Meter & Sensor",
            "category": "Instrumentation",
            "sku": "FM-US-620",
            "description": "Non-invasive transit-time clamp-on ultrasonic flow meter for industrial fluid monitoring. Suitable for pipes from 15mm to 6000mm diameter with accuracy within +/- 1.0%. Zero pressure drop.",
            "market_price": 780.00,
            "min_demand_price": 560.00,
            "rating": 4.8,
            "reviews_count": 19,
            "in_stock": True,
            "image_url": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80",
            "specs": {
                "Brand": "FlowMetric",
                "Model": "FM-US-620",
                "Pipe Diameter": "DN15 to DN6000",
                "Accuracy": "+/- 1.0% of reading",
                "Output Signals": "4-20mA, OCT Pulse, Relay, RS485 Modbus",
                "Fluid Temperature": "-30C to 160C",
                "Enclosure": "Die-cast Aluminum NEMA 4X",
                "MOQ": "5",
                "Unit": "set"
            }
        },
        {
            "id": "33333333-3333-4333-a333-333333333333",
            "name": "Commercial LiFePO4 Energy Storage Module 48V 100Ah",
            "category": "Energy & Power",
            "sku": "VS-48100-RM",
            "description": "High-cycle lithium iron phosphate rack-mount storage battery for microgrids, telecom backup, and commercial solar installations. Over 6000 charge cycles at 80% DoD with integrated smart BMS.",
            "market_price": 1450.00,
            "min_demand_price": 1080.00,
            "rating": 5.0,
            "reviews_count": 27,
            "in_stock": True,
            "image_url": "https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=800&q=80",
            "specs": {
                "Brand": "VoltStore",
                "Model": "VS-48100-RM",
                "Nominal Voltage": "51.2V",
                "Capacity": "100Ah / 5.12kWh",
                "Cycle Life": ">6000 cycles @ 0.5C 80% DoD",
                "Max Charge Current": "100A",
                "Communication": "CAN 2.0B / RS485 BMS Uplink",
                "Mounting": "19-inch 3U Standard Rack",
                "MOQ": "4",
                "Unit": "module"
            }
        },
        {
            "id": "44444444-4444-4444-a444-444444444444",
            "name": "High-Torque NEMA 34 Closed-Loop Stepper Kit",
            "category": "Automation & Robotics",
            "sku": "MP-86HBM-8N",
            "description": "Integrated hybrid closed-loop servo motor kit with DSP digital driver and 1000-line optical encoder. Zero loss of steps, rapid acceleration, and minimal heating for CNC milling and robotic automation.",
            "market_price": 220.00,
            "min_demand_price": 165.00,
            "rating": 4.7,
            "reviews_count": 41,
            "in_stock": True,
            "image_url": "https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80",
            "specs": {
                "Brand": "MotionPro",
                "Model": "MP-86HBM-8N",
                "Holding Torque": "8.5 N.m (1204 oz.in)",
                "Shaft Diameter": "14mm Keyway",
                "Encoder Resolution": "1000 CPR (4000 PPR)",
                "Driver Input": "AC 20-80V / DC 30-110V",
                "Max Step Pulse Frequency": "200 kHz",
                "MOQ": "8",
                "Unit": "kit"
            }
        },
        {
            "id": "55555555-5555-4555-a555-555555555555",
            "name": "Enterprise 10G SFP+ Managed Fiber Switch 24-Port",
            "category": "Networking & Telecom",
            "sku": "ON-SW-24X10",
            "description": "Enterprise Layer 3 aggregation switch featuring 24x 10G SFP+ optical ports and 2x 40G QSFP+ uplink ports. Wire-speed switching fabric with redundant hot-swap AC power supplies.",
            "market_price": 890.00,
            "min_demand_price": 640.00,
            "rating": 4.9,
            "reviews_count": 15,
            "in_stock": True,
            "image_url": "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80",
            "specs": {
                "Brand": "OptiNet Core",
                "Model": "ON-SW-24X10",
                "Switching Capacity": "640 Gbps",
                "Forwarding Rate": "476 Mpps",
                "Ports": "24x 10G SFP+, 2x 40G QSFP+",
                "L3 Routing": "Static, OSPF v2/v3, BGP4, VRRP",
                "Power": "Dual 1+1 Redundant 100-240V AC",
                "MOQ": "2",
                "Unit": "unit"
            }
        },
        {
            "id": "66666666-6666-4666-a666-666666666666",
            "name": "Medical-Grade High-Precision Peristaltic Pump",
            "category": "Medical & Lab Equipment",
            "sku": "BD-PP-400X",
            "description": "Micro-volume precision laboratory and pharmaceutical dispensing pump with calibrated 4-roller rotor and stepper motor drive. Flow range from 0.007 mL/min to 380 mL/min.",
            "market_price": 520.00,
            "min_demand_price": 380.00,
            "rating": 4.8,
            "reviews_count": 12,
            "in_stock": True,
            "image_url": "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
            "specs": {
                "Brand": "BioDose",
                "Model": "BD-PP-400X",
                "Flow Rate": "0.007 - 380 mL/min",
                "Dispense Accuracy": "< 0.5%",
                "Speed Range": "0.1 - 350 rpm (0.1 rpm res)",
                "Tubing Compatibility": "Silicon, PharMed, Norprene",
                "Control Interface": "RS485 Modbus, 0-10V, Touchscreen",
                "MOQ": "3",
                "Unit": "unit"
            }
        }
    ]

    res = client.table("products").upsert(products).execute()
    print(f"Successfully seeded {len(res.data)} products into Supabase!")

if __name__ == "__main__":
    seed()
