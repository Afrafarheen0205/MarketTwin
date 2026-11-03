import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ShoppingCart,
  Store,
  ShieldCheck,
  Users,
  Search,
  Layers,
  Bell,
  Package,
  BarChart3,
  CheckCircle2,
  ArrowRight,
  Zap,
  Globe,
  Lock,
  TrendingUp,
  UserCheck,
  Boxes,
  ClipboardList,
} from 'lucide-react';

type Role = 'customer' | 'merchant' | 'admin';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const primaryButtonStyle = {
    backgroundColor: '#0A101D',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 24,
    padding: '12px 30px',
    height: 50,
    fontSize: 15.5,
    fontWeight: 600 as const,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    transition: 'background 0.2s, transform 0.15s',
  };

  const secondaryButtonStyle = {
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    border: '1px solid #CBD5E1',
    borderRadius: 24,
    padding: '12px 28px',
    height: 50,
    fontSize: 15.5,
    fontWeight: 600 as const,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    transition: 'background 0.2s, border-color 0.2s',
  };

  const roleOptions: { key: Role; title: string; description: string; icon: any; image: string }[] = [
    {
      key: 'customer',
      title: 'Customer',
      description: 'Search products, create custom demands, join buyer pools, compare merchant bids, and approve purchases with full escrow protection.',
      icon: ShoppingCart,
      image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=700&q=80',
    },
    {
      key: 'merchant',
      title: 'Merchant',
      description: 'Discover aggregated demand pools with verified buyer volume, submit competitive bids with custom lead times, and fulfill contracts.',
      icon: Store,
      image: 'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=700&q=80',
    },
    {
      key: 'admin',
      title: 'Admin',
      description: 'Supervise customer accounts, verify merchant accreditation, oversee demand clustering algorithms, audit trade contracts, and track analytics.',
      icon: ShieldCheck,
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=700&q=80',
    },
  ];

  const workflowSteps = [
    {
      step: '01',
      icon: Search,
      title: 'Discover or Request',
      description: 'Customers search existing catalog items or create a demand when something is custom, out-of-stock, or unavailable in required volumes.',
    },
    {
      step: '02',
      icon: Layers,
      title: 'Demand Grouping',
      description: 'Cosine similarity algorithms group compatible customer demands into bulk pools to unlock tier-1 volume discount thresholds.',
    },
    {
      step: '03',
      icon: Package,
      title: 'Merchant Bidding',
      description: 'Accredited suppliers inspect verified demand pools and submit competitive quotes, lead-times, and manufacturer warranty terms.',
    },
    {
      step: '04',
      icon: CheckCircle2,
      title: 'Compare & Approve',
      description: 'Buyers compare proposals in a multi-offer matrix and explicitly sign off on the winning bid before payment commitment.',
    },
    {
      step: '05',
      icon: TrendingUp,
      title: 'Fulfillment & Escrow',
      description: 'Orders move through dispatch and carrier tracking, with escrow capital released only upon buyer quality inspection sign-off.',
    },
  ];

  const customerFeatures = [
    { icon: Search, title: 'Smart Product Search', description: 'Search verified commercial catalog items or instantly trigger a custom demand request with precise specifications.' },
    { icon: Layers, title: 'Guided Demand Creation', description: 'Specify exact requirements, target volume, unit price ceiling, required certifications, and delivery deadlines.' },
    { icon: Users, title: 'Demand Group Pooling', description: 'Combine buying power with peer organizations to meet supplier wholesale minimum order quantities effortlessly.' },
    { icon: Bell, title: 'Real-Time Bid Alerts', description: 'Instant notifications when certified merchants submit competitive quotes for your active demand pools.' },
    { icon: CheckCircle2, title: 'Explicit Approval Gating', description: 'No blind charges—you inspect and explicitly approve the winning proposal before order creation or billing.' },
    { icon: Package, title: 'Logistics Order Tracking', description: 'Track shipment milestones, freight carrier codes, and delivery sign-offs in real time from dispatch to delivery.' },
  ];

  const merchantFeatures = [
    { icon: Layers, title: 'Demand Pool Discovery', description: 'Direct access to aggregated buyer pools with pre-verified purchasing intent, committed quantity, and target pricing.' },
    { icon: Package, title: 'Competitive Offer Bidding', description: 'Submit flexible wholesale price breaks, unit delivery SLA, and warranty guarantees with transparent terms.' },
    { icon: ClipboardList, title: 'Offer Matrix Management', description: 'Track active bids, adjust proposal terms, and respond swiftly to buyer approval triggers from a unified dashboard.' },
    { icon: TrendingUp, title: 'Fulfillment Management', description: 'Update dispatch status, link tracking numbers, manage freight milestones, and initiate escrow payout triggers.' },
    { icon: UserCheck, title: 'Merchant Verification', description: 'Complete platform accreditation to earn certified supplier badges, priority RFQ visibility, and buyer trust.' },
    { icon: BarChart3, title: 'Commercial Analytics', description: 'Monitor win rates, gross sales volume, bidding velocity, repeat buyer conversion, and fulfillment SLA compliance.' },
  ];

  const adminFeatures = [
    { icon: Users, title: 'Customer Management', description: 'Oversee corporate and individual buyer accounts, active demand submissions, and platform transaction history.' },
    { icon: Store, title: 'Merchant Accreditation', description: 'Inspect supplier credentials, trade licenses, compliance certificates, quality certifications, and SLA ratings.' },
    { icon: Layers, title: 'Clustering Governance', description: 'Tune automated grouping sensitivity algorithms and validate multi-party volume pooling activation triggers.' },
    { icon: Package, title: 'Offer Oversight & Auditing', description: 'Monitor bidding transparency, price floor compliance, lead-time realism, and competitive SLA fairness.' },
    { icon: Boxes, title: 'Order & Escrow Oversight', description: 'Audit multi-party escrow balances, track shipment carriers, and mediate trade dispute flags across all transactions.' },
    { icon: BarChart3, title: 'Marketplace Intelligence', description: 'Analyze category volume throughput, average buyer savings unlocked, merchant margins, and platform fee yield.' },
  ];

  const benefits = [
    { icon: Search, title: 'Demand-Driven Sourcing', description: 'Buyers are never limited to static catalogs—the platform creates qualified suppliers tailored to your exact needs.' },
    { icon: TrendingUp, title: 'Unbeatable Volume Savings', description: 'Aggregated demand pools unlock wholesale economies of scale averaging 28.4% below catalog retail prices.' },
    { icon: ShoppingCart, title: 'Customer Control & Zero Risk', description: 'Buyers retain 100% control with explicit approval requirements before payment commitment or fulfillment.' },
    { icon: Store, title: 'Pre-Qualified Merchant Pipeline', description: 'Merchants receive guaranteed buyer demand without costly customer acquisition campaigns or marketing spend.' },
    { icon: Lock, title: 'Bank-Grade Smart Escrow', description: 'Capital remains safely held in escrow vaults and releases only upon verified delivery and buyer inspection.' },
    { icon: Globe, title: 'Scalable Enterprise Architecture', description: 'Built with modular FastAPI microservices, Supabase PostgreSQL, and modern Ant Design design system.' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48, paddingBottom: 48 }}>
      {/* 1. Hero Showcase Card - Expansive Desktop Scale */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 22,
          padding: '48px 56px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: 48,
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              borderRadius: 24,
              backgroundColor: '#EEF2FF',
              color: '#4338CA',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.5,
              marginBottom: 20,
            }}
          >
            <Sparkles className="w-4 h-4" />
            <span>DEMAND-DRIVEN B2B COMMERCE PLATFORM</span>
          </div>

          <h1
            style={{
              fontSize: 58,
              fontWeight: 800,
              color: '#0F172A',
              margin: 0,
              lineHeight: 1.15,
              letterSpacing: -1.5,
            }}
          >
            Market<span style={{ color: '#4F46E5' }}>Twin</span>
          </h1>

          <p
            style={{
              fontSize: 19,
              color: '#475569',
              marginTop: 20,
              lineHeight: 1.75,
              maxWidth: 620,
            }}
          >
            MarketTwin connects customer demand groups directly with competitive merchant offers. Customers can request products, group compatible demands, and unlock better pricing through merchant bidding.
          </p>

          <div style={{ display: 'flex', gap: 16, marginTop: 34, flexWrap: 'wrap' }}>
            <button
              style={primaryButtonStyle}
              onClick={() => navigate('/register/customer')}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1E293B')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0A101D')}
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              style={secondaryButtonStyle}
              onClick={() => navigate('/login')}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
            >
              Sign In
            </button>
          </div>
        </div>

        <div
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0,0,0,0.08)',
            border: '1px solid #E2E8F0',
            height: 400,
          }}
        >
          <img
            src="https://images.unsplash.com/photo-1557821552-17105176677c?auto=format&fit=crop&w=1000&q=80"
            alt="Online marketplace shopping"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      </div>

      {/* 2. Role Selection Showcase */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 22,
          padding: '44px 52px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Users className="w-7 h-7" style={{ color: '#4F46E5' }} />
          <span>Select Your Role</span>
        </div>
        <p style={{ fontSize: 16, color: '#64748B', marginBottom: 28, lineHeight: 1.6 }}>
          Choose your role to access the appropriate login and registration options.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 26 }}>
          {roleOptions.map((role) => {
            const Icon = role.icon;
            const selected = selectedRole === role.key;
            return (
              <div
                key={role.key}
                onClick={() => setSelectedRole(role.key)}
                style={{
                  backgroundColor: '#FFFFFF',
                  border: `2px solid ${selected ? '#4F46E5' : '#E2E8F0'}`,
                  borderRadius: 18,
                  padding: 26,
                  cursor: 'pointer',
                  boxShadow: selected ? '0 12px 30px rgba(79,70,229,0.14)' : '0 1px 3px rgba(0,0,0,0.03)',
                  transform: selected ? 'translateY(-4px)' : 'translateY(0)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ height: 200, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
                    <img
                      src={role.image}
                      alt={role.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: '#EEF2FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#4F46E5',
                        flexShrink: 0,
                      }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>{role.title}</div>
                  </div>

                  <div style={{ fontSize: 15, color: '#475569', lineHeight: 1.65 }}>
                    {role.description}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 22,
                    paddingTop: 16,
                    borderTop: '1px solid #F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: selected ? '#4F46E5' : '#64748B' }}>
                    {selected ? '● Selected' : 'Click to Select'}
                  </span>
                  <ArrowRight className="w-4 h-4" style={{ color: selected ? '#4F46E5' : '#94A3B8' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Role Action Area */}
        <div
          style={{
            marginTop: 32,
            padding: 26,
            borderRadius: 16,
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
          }}
        >
          {!selectedRole ? (
            <div style={{ fontSize: 15.5, color: '#64748B', textAlign: 'center', fontWeight: 500 }}>
              Please select a role above to proceed to the role portal.
            </div>
          ) : selectedRole === 'admin' ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button style={primaryButtonStyle} onClick={() => navigate('/login?role=admin')}>
                <span>Access Admin Portal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
              <button style={primaryButtonStyle} onClick={() => navigate(`/login?role=${selectedRole}`)}>
                <span>{selectedRole === 'customer' ? 'Customer' : 'Merchant'} Login</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                style={secondaryButtonStyle}
                onClick={() => navigate(selectedRole === 'customer' ? '/register/customer' : '/register/merchant')}
              >
                Register as {selectedRole === 'customer' ? 'Buyer' : 'Merchant'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. How MarketTwin Works - Wrapped in spacious container card */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 22,
          padding: '44px 52px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <ArrowRight className="w-7 h-7" style={{ color: '#4F46E5' }} />
          <span>How MarketTwin Works</span>
        </div>
        <p style={{ fontSize: 16, color: '#64748B', marginBottom: 32, lineHeight: 1.6 }}>
          The complete customer-to-merchant demand aggregation and fulfillment lifecycle.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          {workflowSteps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 18,
                  padding: '28px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 240,
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 10px 24px rgba(0,0,0,0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: 20,
                        backgroundColor: '#EEF2FF',
                        color: '#4F46E5',
                        fontWeight: 800,
                        fontSize: 13.5,
                      }}
                    >
                      Step {step.step}
                    </span>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#4F46E5',
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>

                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                    {step.title}
                  </div>
                  <div style={{ fontSize: 14.5, color: '#475569', lineHeight: 1.65 }}>
                    {step.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Customer Features - Perfectly balanced 3 columns x 2 rows (6 cards) */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 22,
          padding: '44px 52px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <ShoppingCart className="w-7 h-7" style={{ color: '#2563EB' }} />
          <span>Customer Features</span>
        </div>
        <p style={{ fontSize: 16, color: '#64748B', marginBottom: 32, lineHeight: 1.6 }}>
          Everything commercial buyers need to specify demands, join pools, and approve wholesale contracts.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {customerFeatures.map((feature) => (
            <SectionCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              badgeBg="#EFF6FF"
              badgeColor="#2563EB"
            />
          ))}
        </div>
      </div>

      {/* 5. Merchant Features - Perfectly balanced 3 columns x 2 rows (6 cards) */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 22,
          padding: '44px 52px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Store className="w-7 h-7" style={{ color: '#059669' }} />
          <span>Merchant Features</span>
        </div>
        <p style={{ fontSize: 16, color: '#64748B', marginBottom: 32, lineHeight: 1.6 }}>
          Enterprise supplier capabilities to discover verified volume, submit bids, and fulfill orders.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {merchantFeatures.map((feature) => (
            <SectionCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              badgeBg="#ECFDF5"
              badgeColor="#059669"
            />
          ))}
        </div>
      </div>

      {/* 6. Admin Features - Perfectly balanced 3 columns x 2 rows (6 cards) */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 22,
          padding: '44px 52px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <ShieldCheck className="w-7 h-7" style={{ color: '#7C3AED' }} />
          <span>Admin Features</span>
        </div>
        <p style={{ fontSize: 16, color: '#64748B', marginBottom: 32, lineHeight: 1.6 }}>
          Platform governance, trade oversight, escrow protection, and operational intelligence.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminFeatures.map((feature) => (
            <SectionCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              badgeBg="#EDE9FE"
              badgeColor="#7C3AED"
            />
          ))}
        </div>
      </div>

      {/* 7. Key Strategic Benefits - Perfectly balanced 3 columns x 2 rows (6 cards) */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 22,
          padding: '44px 52px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Zap className="w-7 h-7" style={{ color: '#D97706' }} />
          <span>Key Strategic Benefits</span>
        </div>
        <p style={{ fontSize: 16, color: '#64748B', marginBottom: 32, lineHeight: 1.6 }}>
          Why MarketTwin fundamentally transforms traditional B2B procurement and selling.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit) => (
            <SectionCard
              key={benefit.title}
              icon={benefit.icon}
              title={benefit.title}
              description={benefit.description}
              badgeBg="#FFFBEB"
              badgeColor="#D97706"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface SectionCardProps {
  icon: any;
  title: string;
  description: string;
  badgeBg: string;
  badgeColor: string;
}

const SectionCard: React.FC<SectionCardProps> = ({ icon: Icon, title, description, badgeBg, badgeColor }) => {
  return (
    <div
      style={{
        backgroundColor: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: 18,
        padding: '30px 28px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#FFFFFF';
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.06)';
        e.currentTarget.style.borderColor = '#CBD5E1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#F8FAFC';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = '#E2E8F0';
      }}
    >
      <div>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            backgroundColor: badgeBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: badgeColor,
            marginBottom: 20,
          }}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div style={{ fontSize: 19.5, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
          {title}
        </div>
        <div style={{ fontSize: 15, color: '#475569', lineHeight: 1.65 }}>
          {description}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
